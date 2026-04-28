/**
 * lib/legal/extract.ts
 * 
 * Text extraction from uploaded files.
 * Returns clean text that Claude can actually read.
 * 
 * DOCX → mammoth (preserves paragraph structure)
 * PDF  → pdf-parse (extracts raw text)
 * TXT/MD/other → direct read
 */

// Dynamic imports to avoid SSR issues
async function extractDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth')
  const result  = await mammoth.extractRawText({ buffer })
  return result.value?.trim() ?? ''
}

async function extractPdf(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{text: string}>
  const result   = await pdfParse(buffer)
  return result.text?.trim() ?? ''
}

export async function extractText(buffer: Buffer, filename: string): Promise<string> {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''

  try {
    if (ext === 'docx' || ext === 'doc') {
      const text = await extractDocx(buffer)
      if (text.length > 50) return text
      // Fallback: try as text
      return buffer.toString('utf8').replace(/[^\x20-\x7E\u00C0-\u024F\u0100-\u017E\u0400-\u04FF\n\r\t ]/g, ' ').trim()
    }

    if (ext === 'pdf') {
      const text = await extractPdf(buffer)
      if (text.length > 50) return text
      return `[PDF extraction failed — please upload a text version of ${filename}]`
    }

    // Plain text files: txt, md, csv, json, etc.
    return buffer.toString('utf8')

  } catch (e) {
    console.error(`[extract] Failed for ${filename}:`, (e as Error).message)
    // Last resort: force UTF-8 decode
    const raw = buffer.toString('utf8')
    if (raw.length > 100 && !raw.startsWith('%PDF')) return raw
    return `[Could not extract text from ${filename}. Please upload as .txt]`
  }
}

export function fileTypeLabel(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    pdf: 'PDF', docx: 'DOCX', doc: 'DOC', txt: 'TXT', md: 'MD',
    csv: 'CSV', json: 'JSON', html: 'HTML'
  }
  return map[ext] ?? ext.toUpperCase()
}
