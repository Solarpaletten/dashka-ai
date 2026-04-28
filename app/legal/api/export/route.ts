/**
 * GET /legal/api/export?caseId=...&format=txt|docx
 * Returns the final approved document for download.
 */

import { NextResponse } from 'next/server'
import { getCase, getVersions, getComments, getRounds, getApprovals } from '@/lib/legal/store'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const caseId = searchParams.get('caseId')
  const format = searchParams.get('format') ?? 'txt'

  if (!caseId) return NextResponse.json({ error: 'caseId required' }, { status: 400 })

  const legalCase = getCase(caseId)
  if (!legalCase) return NextResponse.json({ error: 'Case not found' }, { status: 404 })

  const versions  = getVersions(caseId)
  const comments  = getComments(caseId)
  const rounds    = getRounds(caseId)
  const approvals = getApprovals(caseId)
  const finalVersion = versions[versions.length - 1]

  if (!finalVersion) return NextResponse.json({ error: 'No document version found' }, { status: 404 })

  if (format === 'txt') {
    const content = [
      `═══════════════════════════════════════`,
      `SOLAR LEGAL STYLE — EXPORTED DOCUMENT`,
      `═══════════════════════════════════════`,
      `Case: ${legalCase.title}`,
      `Court: ${legalCase.jurisdiction}`,
      `Type: ${legalCase.documentType}`,
      `Version: ${finalVersion.label}`,
      `Exported: ${new Date().toISOString()}`,
      ``,
      `─────────────────────────────────────────`,
      `DOCUMENT`,
      `─────────────────────────────────────────`,
      ``,
      finalVersion.content,
      ``,
      `─────────────────────────────────────────`,
      `AUDIT LOG — ${rounds.length} round(s)`,
      `─────────────────────────────────────────`,
      ...rounds.map(r => [
        ``,
        `Round ${r.number} | Match score: ${Math.round(r.matchScore * 100)}%`,
        `Version: ${r.versionId}`,
        `Completed: ${r.completedAt ?? 'ongoing'}`,
        `Comments this round: ${comments.filter(c => c.roundNumber === r.number).length}`
      ].join('\n')),
      ``,
      `─────────────────────────────────────────`,
      `APPROVALS`,
      `─────────────────────────────────────────`,
      ...approvals.map(a => `${a.roleName} — ${a.decision} at round ${a.roundNumber}: ${a.notes}`)
    ].join('\n')

    return new Response(content, {
      headers: {
        'Content-Type':        'text/plain;charset=utf-8',
        'Content-Disposition': `attachment; filename="${legalCase.title.replace(/\s+/g, '_')}_${finalVersion.label.replace(/\s+/g, '_')}.txt"`
      }
    })
  }

  // JSON audit export
  if (format === 'json') {
    return NextResponse.json({
      case:       legalCase,
      versions,
      rounds,
      comments,
      approvals,
      exportedAt: new Date().toISOString()
    }, {
      headers: { 'Content-Disposition': `attachment; filename="${legalCase.id}_audit.json"` }
    })
  }

  return NextResponse.json({ error: 'Supported formats: txt, json' }, { status: 400 })
}
