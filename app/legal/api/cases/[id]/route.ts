/**
 * PATCH /legal/api/cases/[id]?action=upload
 * Real PDF/DOCX/TXT parsing with validation + honest error reporting.
 */

import { NextResponse } from 'next/server'
import { getCase, updateCase } from '@/lib/legal/store'

// ── Text validation ─────────────────────────────────────────────────────
function isValidText(text: string, filename: string): boolean {
  if (text.length < 500) return false
  // Must have some alphabetic characters (not just binary garbage)
  const alphaRatio = (text.match(/[a-zA-ZąčęėįšųūžĄČĘĖĮŠŲŪŽ]/g) ?? []).length / text.length
  return alphaRatio > 0.2
}

function cleanText(raw: string): string {
  return raw
    .replace(/\x00/g, '')                        // null bytes
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, '') // control chars except \n \r \t
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')                 // max 3 consecutive newlines
    .trim()
}

// ── PDF extraction ──────────────────────────────────────────────────────
async function extractPdf(buf: Buffer): Promise<string> {
  // pdf-parse v1 — simple function API: pdfParse(buffer) => Promise<{text}>
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfParse = (await import('pdf-parse')) as any
    const fn = typeof pdfParse === 'function' ? pdfParse
             : typeof pdfParse.default === 'function' ? pdfParse.default
             : null
    if (fn) {
      const result = await fn(buf)
      const text   = cleanText(result.text ?? '')
      if (isValidText(text, 'pdf')) {
        console.log(`[pdf] pdf-parse OK: ${text.length} chars`)
        return text
      }
      console.warn('[pdf] pdf-parse returned invalid text, trying fallback')
    }
  } catch (e) {
    console.warn('[pdf] pdf-parse failed:', (e as Error).message)
  }

  // Fallback: extract printable ASCII + Lithuanian chars from raw bytes
  const raw     = buf.toString('latin1')
  const cleaned = raw
    .replace(/[^\x20-\x7E\u00C0-\u024F\n\r\t]/g, ' ')
    .replace(/\s{4,}/g, '\n')
    .trim()

  if (isValidText(cleaned, 'pdf-fallback')) {
    console.log(`[pdf] fallback text extraction: ${cleaned.length} chars`)
    return cleaned
  }

  return `[PDF: "${buf.length} bytes — text could not be extracted. Convert to .txt for best results.]`
}

// ── DOCX extraction ─────────────────────────────────────────────────────
async function extractDocx(buf: Buffer): Promise<string> {
  try {
    const mammoth = await import('mammoth')
    const result  = await mammoth.extractRawText({ buffer: buf })
    const text    = cleanText(result.value ?? '')
    if (isValidText(text, 'docx')) {
      console.log(`[docx] mammoth OK: ${text.length} chars`)
      return text
    }
    console.warn('[docx] mammoth returned short/invalid text')
  } catch (e) {
    console.warn('[docx] mammoth failed:', (e as Error).message)
  }

  // Fallback: read as UTF-8 (works for some DOCX files)
  const fallback = cleanText(buf.toString('utf-8'))
  if (isValidText(fallback, 'docx-fallback')) {
    console.log(`[docx] utf-8 fallback: ${fallback.length} chars`)
    return fallback
  }

  return `[DOCX: "${buf.length} bytes — extraction failed. Convert to .txt for best results.]`
}

// ── Main extractor ──────────────────────────────────────────────────────
async function extractText(file: File): Promise<{ text: string; method: string }> {
  const name = file.name.toLowerCase()
  const buf  = Buffer.from(await file.arrayBuffer())

  if (name.match(/\.(txt|md|csv|json|js|ts|py|html|css|xml|rtf)$/)) {
    const text = cleanText(buf.toString('utf-8'))
    return { text, method: 'utf-8' }
  }

  if (name.endsWith('.pdf')) {
    const text = await extractPdf(buf)
    return { text, method: 'pdf-parse' }
  }

  if (name.match(/\.docx?$/)) {
    const text = await extractDocx(buf)
    return { text, method: 'mammoth' }
  }

  // Unknown format — try UTF-8
  const text = cleanText(buf.toString('utf-8'))
  return { text: isValidText(text, name) ? text : `[Unknown format: ${file.name}]`, method: 'utf-8-fallback' }
}

// ── Route handlers ──────────────────────────────────────────────────────

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const c = getCase(params.id)
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(c)
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const c = getCase(params.id)
    if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const url    = new URL(req.url)
    const action = url.searchParams.get('action')

    // ── Upload ──────────────────────────────────────────────────────────
    if (action === 'upload') {
      const formData = await req.formData()
      const files    = formData.getAll('file') as File[]
      if (!files.length) return NextResponse.json({ error: 'No files' }, { status: 400 })

      const results: Array<{ name: string; chars: number; method: string; valid: boolean }> = []

      for (const file of files) {
        const { text, method } = await extractText(file).catch(e => ({
          text: `[Error: ${(e as Error).message}]`, method: 'error'
        }))

        const valid = isValidText(text, file.name)
        const ext   = file.name.split('.').pop()?.toLowerCase() ?? 'txt'
        const type  = ext === 'pdf' ? 'pdf' : ext.startsWith('doc') ? 'docx' : 'txt'

        c.sourceDocuments.push({
          id:      Math.random().toString(36).slice(2),
          name:    file.name,
          type,
          content: text,
          addedAt: new Date().toISOString()
        })

        results.push({ name: file.name, chars: text.length, method, valid })
        console.log(`[upload] ${file.name}: ${text.length} chars via ${method} (valid: ${valid})`)
      }

      c.updatedAt = new Date().toISOString()
      return NextResponse.json({ ...c, _uploadResults: results })
    }

    // ── Update task / title ─────────────────────────────────────────────
    const body = await req.json()
    const patch: Partial<typeof c> = {}
    if (body.taskText !== undefined) patch.taskText = body.taskText
    if (body.title    !== undefined) patch.title    = body.title
    return NextResponse.json(updateCase(params.id, patch))

  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const url   = new URL(req.url)
  const docId = url.searchParams.get('docId')
  const c     = getCase(params.id)
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (docId) {
    c.sourceDocuments = c.sourceDocuments.filter(d => d.id !== docId)
    c.updatedAt = new Date().toISOString()
  }
  return NextResponse.json(c)
}
