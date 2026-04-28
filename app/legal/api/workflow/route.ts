/**
 * POST /legal/api/workflow
 * 
 * Single-phase execution only. Client calls phases sequentially.
 * This avoids Next.js 30s route timeout on long AI chains.
 *
 * Phases: dashka_briefing | claude_drafting | consultant_review | dashka_review | claude_revision
 */

// Extend timeout to 5 minutes for this route
export const maxDuration = 300

import { NextResponse } from 'next/server'
import {
  getCase, updateCase, addVersion, getLatestVersion,
  addComment, getComments, startRound, completeRound,
  getRounds, getVersions, getWorkflow, updateWorkflow, logWorkflow,
  saveBrief, loadBrief
} from '@/lib/legal/store'
import {
  dashkaBrief, dashkaReview,
  claudeDraft, claudeRevise,
  consultantReview,
  parseReviewComments, computeMatchScore, checkConsultantApproval
} from '@/lib/legal/roles'
import type { WorkflowPhase } from '@/lib/legal/types'

// ── Phase runners ─────────────────────────────────────────────────────

async function runDashkaBriefing(caseId: string) {
  const legalCase = getCase(caseId)!
  const brief = await dashkaBrief(legalCase, legalCase.taskText)
  saveBrief(caseId, brief)
  updateWorkflow(caseId, { currentPhase: 'claude_drafting' })
  logWorkflow(caseId, { phase: 'dashka_briefing', role: 'dashka', message: 'Brief created and saved' })
  return { phase: 'claude_drafting' as WorkflowPhase, brief, message: 'Brief ready → now run Claude drafting' }
}

async function runClaudeDrafting(caseId: string) {
  const legalCase = getCase(caseId)!
  const wf = getWorkflow(caseId)
  const brief = loadBrief(caseId) || legalCase.taskText

  const draftText = await claudeDraft(brief, legalCase)
  const round = wf.currentRound + 1

  const version = addVersion({
    caseId, roundNumber: round,
    label: `Draft v${round}`,
    content: draftText,
    authorRole: 'claude_engineer',
    changesSummary: round === 1 ? 'Initial draft from Dashka brief' : `Revision round ${round}`
  })

  startRound(caseId, round, version.id)
  updateCase(caseId, { status: 'in_review', currentRound: round })
  updateWorkflow(caseId, { currentPhase: 'consultant_review', currentRound: round })
  logWorkflow(caseId, { phase: 'claude_drafting', role: 'claude_engineer',
    message: `Draft v${round} created (${draftText.length} chars)` })

  return { phase: 'consultant_review' as WorkflowPhase, version, message: `Draft v${round} ready → now run Consultant review` }
}

async function runConsultantReview(caseId: string) {
  const legalCase = getCase(caseId)!
  const wf = getWorkflow(caseId)
  const version = getLatestVersion(caseId)
  if (!version) throw new Error('No document version yet. Run Claude drafting first.')

  const raw = await consultantReview(version.content, wf.currentRound, legalCase)
  const parsed = parseReviewComments(raw, caseId, wf.currentRound, version.id, 'consultant')
  parsed.forEach(c => addComment(c))

  const approved = checkConsultantApproval(raw)
  updateWorkflow(caseId, { currentPhase: 'dashka_review', consultantApproved: approved })
  logWorkflow(caseId, { phase: 'consultant_review', role: 'consultant',
    message: `${parsed.length} comments | approved: ${approved}` })

  return {
    phase: 'dashka_review' as WorkflowPhase,
    rawReview: raw, comments: parsed, approved,
    message: `Consultant: ${parsed.length} issues → now run Dashka review`
  }
}

async function runDashkaReview(caseId: string) {
  const legalCase = getCase(caseId)!
  const wf = getWorkflow(caseId)
  const version = getLatestVersion(caseId)
  if (!version) throw new Error('No document version')

  const consultantComments = getComments(caseId, wf.currentRound).filter(c => c.authorRole === 'consultant')
  const raw = await dashkaReview(legalCase, version, consultantComments, wf.currentRound)
  const parsed = parseReviewComments(raw, caseId, wf.currentRound, version.id, 'dashka')
  parsed.forEach(c => addComment(c))

  const allRoundComments = getComments(caseId, wf.currentRound)
  const dComments = allRoundComments.filter(c => c.authorRole === 'dashka')
  const cComments = allRoundComments.filter(c => c.authorRole === 'consultant')
  const matchScore = computeMatchScore(dComments, cComments)

  completeRound(caseId, wf.currentRound, matchScore)
  const openCount = allRoundComments.filter(c => c.status === 'open').length
  const readyForFinal = wf.consultantApproved && matchScore >= 0.70 && openCount <= 3

  updateWorkflow(caseId, {
    currentPhase: readyForFinal ? 'awaiting_architect' : 'claude_revision',
    matchScore, activeComments: openCount, readyForFinal, dashkaApproved: readyForFinal
  })
  logWorkflow(caseId, { phase: 'dashka_review', role: 'dashka',
    message: `Match: ${Math.round(matchScore*100)}% | open: ${openCount} | ready: ${readyForFinal}` })

  return {
    phase: (readyForFinal ? 'awaiting_architect' : 'claude_revision') as WorkflowPhase,
    rawReview: raw, comments: parsed, matchScore, openCount, readyForFinal,
    message: `Round ${wf.currentRound} done. Match: ${Math.round(matchScore*100)}%${readyForFinal ? ' ✅ READY FOR FINAL' : ' → run Claude revision'}`
  }
}

async function runClaudeRevision(caseId: string) {
  const wf = getWorkflow(caseId)
  const version = getLatestVersion(caseId)
  if (!version) throw new Error('No document version')

  const allComments = getComments(caseId, wf.currentRound)
  const revisedText = await claudeRevise(
    version.content,
    allComments.filter(c => c.authorRole === 'dashka'),
    allComments.filter(c => c.authorRole === 'consultant'),
    wf.currentRound + 1
  )

  const nextRound = wf.currentRound + 1
  const legalCase = getCase(caseId)!
  const newVersion = addVersion({
    caseId, roundNumber: nextRound,
    label: nextRound >= legalCase.maxRounds ? 'Final candidate' : `Draft v${nextRound}`,
    content: revisedText, authorRole: 'claude_engineer',
    changesSummary: `Revision: ${allComments.filter(c=>c.status==='open').length} comments from round ${wf.currentRound}`
  })

  startRound(caseId, nextRound, newVersion.id)
  updateCase(caseId, { currentRound: nextRound })
  updateWorkflow(caseId, { currentPhase: 'consultant_review', currentRound: nextRound })
  logWorkflow(caseId, { phase: 'claude_revision', role: 'claude_engineer',
    message: `Revised to round ${nextRound} (${newVersion.content.length} chars)` })

  return {
    phase: 'consultant_review' as WorkflowPhase,
    version: newVersion,
    message: `Round ${nextRound} ready → click "Run Round ${nextRound}" to continue`
  }
}

// ── Route handler ─────────────────────────────────────────────────────

export async function POST(req: Request) {
  let body: { caseId: string; phase: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { caseId, phase } = body
  if (!caseId || !phase)
    return NextResponse.json({ error: 'caseId and phase required' }, { status: 400 })

  const legalCase = getCase(caseId)
  if (!legalCase) return NextResponse.json({ error: 'Case not found' }, { status: 404 })

  logWorkflow(caseId, { phase: phase as WorkflowPhase, role: 'system', message: `Starting: ${phase}` })

  try {
    let result: Record<string, unknown>

    if      (phase === 'dashka_briefing')    result = await runDashkaBriefing(caseId)
    else if (phase === 'claude_drafting')    result = await runClaudeDrafting(caseId)
    else if (phase === 'consultant_review')  result = await runConsultantReview(caseId)
    else if (phase === 'dashka_review')      result = await runDashkaReview(caseId)
    else if (phase === 'claude_revision')    result = await runClaudeRevision(caseId)
    else return NextResponse.json({ error: `Unknown phase: ${phase}` }, { status: 400 })

    return NextResponse.json(result)

  } catch (e) {
    const msg = (e as Error).message
    console.error(`[legal/workflow] phase=${phase} caseId=${caseId}:`, msg)
    logWorkflow(caseId, { phase: phase as WorkflowPhase, role: 'system', message: `ERROR: ${msg}` })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const caseId = searchParams.get('caseId')
  if (!caseId) return NextResponse.json({ error: 'caseId required' }, { status: 400 })

  const legalCase = getCase(caseId)
  if (!legalCase) return NextResponse.json({ error: 'Case not found' }, { status: 404 })

  return NextResponse.json({
    case:      legalCase,
    workflow:  getWorkflow(caseId),
    rounds:    getRounds(caseId),
    versions:  getVersions(caseId),
    comments:  getComments(caseId)
  })
}
