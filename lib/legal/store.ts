/**
 * lib/legal/store.ts
 * In-memory store for Legal cases, rounds, versions, comments, briefs.
 * Replace with PostgreSQL/SQLite for production persistence.
 */

import type {
  LegalCase, Round, DocumentVersion,
  ReviewComment, VoiceTask, Approval, WorkflowState
} from './types'

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

const cases:    Map<string, LegalCase>         = new Map()
const rounds:   Map<string, Round[]>           = new Map()
const versions: Map<string, DocumentVersion[]> = new Map()
const comments: Map<string, ReviewComment[]>   = new Map()
const voices:   Map<string, VoiceTask[]>       = new Map()
const approvals: Map<string, Approval[]>       = new Map()
const workflows: Map<string, WorkflowState>    = new Map()
// ← NEW: store briefs between phases (dashka → claude)
const briefs:   Map<string, string>            = new Map()  // caseId → latest brief text

// ── Cases ─────────────────────────────────────────────────────────────
export function createCase(data: Omit<LegalCase, 'id' | 'createdAt' | 'updatedAt' | 'currentRound' | 'maxRounds' | 'sourceDocuments'>): LegalCase {
  const now = new Date().toISOString()
  const c: LegalCase = {
    ...data, id: uid(), createdAt: now, updatedAt: now,
    currentRound: 0, maxRounds: 8, sourceDocuments: []
  }
  cases.set(c.id, c)
  rounds.set(c.id, []); versions.set(c.id, [])
  comments.set(c.id, []); voices.set(c.id, []); approvals.set(c.id, [])
  return c
}
export const getCase   = (id: string) => cases.get(id)
export const listCases = () => [...cases.values()].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))
export function updateCase(id: string, patch: Partial<LegalCase>): LegalCase | null {
  const c = cases.get(id); if (!c) return null
  const u = { ...c, ...patch, updatedAt: new Date().toISOString() }
  cases.set(id, u); return u
}

// ── Briefs (between dashka_briefing and claude_drafting) ───────────────
export const saveBrief   = (caseId: string, text: string) => briefs.set(caseId, text)
export const loadBrief   = (caseId: string) => briefs.get(caseId) ?? ''

// ── Versions ──────────────────────────────────────────────────────────
export function addVersion(v: Omit<DocumentVersion, 'id' | 'createdAt'>): DocumentVersion {
  const dv: DocumentVersion = { ...v, id: uid(), createdAt: new Date().toISOString() }
  versions.get(v.caseId)?.push(dv); return dv
}
export const getVersions      = (caseId: string) => versions.get(caseId) ?? []
export const getLatestVersion = (caseId: string): DocumentVersion | null => {
  const vs = versions.get(caseId) ?? []; return vs.length ? vs[vs.length - 1] : null
}

// ── Comments ──────────────────────────────────────────────────────────
export function addComment(c: Omit<ReviewComment, 'id' | 'createdAt'>): ReviewComment {
  const rc: ReviewComment = { ...c, id: uid(), createdAt: new Date().toISOString() }
  comments.get(c.caseId)?.push(rc); return rc
}
export const getComments = (caseId: string, round?: number) => {
  const all = comments.get(caseId) ?? []
  return round != null ? all.filter(c => c.roundNumber === round) : all
}
export function updateComment(caseId: string, commentId: string, patch: Partial<ReviewComment>) {
  const list = comments.get(caseId); if (!list) return
  const i = list.findIndex(c => c.id === commentId)
  if (i >= 0) list[i] = { ...list[i], ...patch }
}

// ── Rounds ────────────────────────────────────────────────────────────
export function startRound(caseId: string, number: number, versionId: string): Round {
  const r: Round = { id: uid(), caseId, number, status: 'active', versionId,
    matchScore: 0, createdAt: new Date().toISOString(), completedAt: null }
  rounds.get(caseId)?.push(r); return r
}
export function completeRound(caseId: string, number: number, matchScore: number) {
  const r = rounds.get(caseId)?.find(r => r.number === number)
  if (r) { r.status = 'complete'; r.matchScore = matchScore; r.completedAt = new Date().toISOString() }
}
export const getRounds = (caseId: string) => rounds.get(caseId) ?? []

// ── Voice ─────────────────────────────────────────────────────────────
export function addVoiceTask(v: Omit<VoiceTask, 'id' | 'createdAt'>): VoiceTask {
  const vt: VoiceTask = { ...v, id: uid(), createdAt: new Date().toISOString() }
  voices.get(v.caseId)?.push(vt); return vt
}
export const getVoiceTasks = (caseId: string) => voices.get(caseId) ?? []

// ── Approvals ─────────────────────────────────────────────────────────
export function addApproval(a: Omit<Approval, 'id' | 'createdAt'>): Approval {
  const ap: Approval = { ...a, id: uid(), createdAt: new Date().toISOString() }
  approvals.get(a.caseId)?.push(ap); return ap
}
export const getApprovals = (caseId: string) => approvals.get(caseId) ?? []

// ── Workflow state ─────────────────────────────────────────────────────
export function getWorkflow(caseId: string): WorkflowState {
  if (!workflows.has(caseId)) {
    workflows.set(caseId, {
      caseId, currentPhase: 'awaiting_task', currentRound: 0,
      activeComments: 0, matchScore: 0, consultantApproved: false,
      dashkaApproved: false, readyForFinal: false, log: []
    })
  }
  return workflows.get(caseId)!
}
export function updateWorkflow(caseId: string, patch: Partial<WorkflowState>): WorkflowState {
  const wf = getWorkflow(caseId)
  const u = { ...wf, ...patch }; workflows.set(caseId, u); return u
}
export function logWorkflow(caseId: string, entry: Omit<WorkflowState['log'][0], 'ts'>) {
  getWorkflow(caseId).log.push({ ...entry, ts: new Date().toISOString() })
}
