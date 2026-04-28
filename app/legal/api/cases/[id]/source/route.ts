/**
 * GET /legal/api/cases/[id]/source?docId=xxx
 * Returns source document content as plain text for preview
 */
import { NextResponse } from 'next/server'
import { getCase } from '@/lib/legal/store'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const docId = new URL(req.url).searchParams.get('docId')
  const c = getCase(params.id)
  if (!c) return NextResponse.json({ error: 'Case not found' }, { status: 404 })
  if (!docId) return NextResponse.json({ error: 'docId required' }, { status: 400 })
  const doc = c.sourceDocuments.find(d => d.id === docId)
  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  return new NextResponse(doc.content, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  })
}
