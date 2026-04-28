/**
 * lib/legal/types.ts
 * Solar Legal Style — core entity types
 */

// ── Roles ─────────────────────────────────────────────────────────────
export type RoleName = 'dashka' | 'claude_engineer' | 'consultant'

export const ROLE_LABELS: Record<RoleName, string> = {
  dashka:          'Dashka Super-Senior',
  claude_engineer: 'Claude Engineer',
  consultant:      'Consultant Advocate'
}

// ── Case ─────────────────────────────────────────────────────────────
export type CaseStatus =
  | 'new'
  | 'task_received'
  | 'brief_ready'
  | 'draft_v1'
  | 'in_review'
  | 'in_revision'
  | 'final_candidate'
  | 'approved'
  | 'exported'

export type DocumentType =
  | 'ieškinys'          // claim/lawsuit
  | 'atsiliepimas'      // response
  | 'trūkumų_šalinimas' // defect removal
  | 'kasacinis'         // cassation
  | 'prašymas'          // request/motion
  | 'other'

export interface LegalCase {
  id:            string
  title:         string
  jurisdiction:  string           // e.g. "Vilniaus apygardos teismas"
  documentType:  DocumentType
  language:      'lt'             // always Lithuanian
  status:        CaseStatus
  taskText:      string           // architect's task (from voice or text)
  createdAt:     string           // ISO
  updatedAt:     string
  currentRound:  number
  maxRounds:     number           // default 8
  sourceDocuments: SourceDocument[]
}

export interface SourceDocument {
  id:       string
  name:     string
  type:     'pdf' | 'docx' | 'txt' | 'paste'
  content:  string              // extracted plain text
  addedAt:  string
}

// ── Rounds ────────────────────────────────────────────────────────────
export interface Round {
  id:          string
  caseId:      string
  number:      number            // 1, 2, 3 ...
  status:      'active' | 'complete' | 'skipped'
  versionId:   string            // which DocumentVersion this round produced
  matchScore:  number            // 0–1: how much Dashka ∩ Consultant agree
  createdAt:   string
  completedAt: string | null
}

// ── Document versions ─────────────────────────────────────────────────
export type VersionLabel =
  | `Draft v${number}`
  | 'Final candidate'
  | 'Final approved'

export interface DocumentVersion {
  id:          string
  caseId:      string
  roundNumber: number
  label:       VersionLabel
  content:     string            // full document text in Lithuanian
  authorRole:  RoleName
  createdAt:   string
  changesSummary: string         // brief description of what changed
}

// ── Review comments ───────────────────────────────────────────────────
export type CommentType =
  | 'language'
  | 'legal_style'
  | 'court_phraseology'
  | 'grammar'
  | 'symbols'            // Lithuanian chars: ą č ę ė į š ų ū ž
  | 'terminology'
  | 'structure'
  | 'missing_argument'
  | 'weak_argument'
  | 'formal_defect'

export type Severity = 'critical' | 'major' | 'minor' | 'suggestion'

export type CommentStatus = 'open' | 'addressed' | 'rejected' | 'matched'

export interface ReviewComment {
  id:             string
  caseId:         string
  roundNumber:    number
  versionId:      string
  authorRole:     RoleName
  type:           CommentType
  severity:       Severity
  commentText:    string
  targetFragment: string | null  // quote from document
  matchedGroupId: string | null  // if same issue noted by both Dashka & Consultant
  status:         CommentStatus
  createdAt:      string
}

// ── Voice tasks ───────────────────────────────────────────────────────
export type VoiceStatus = 'idle' | 'listening' | 'transcribing' | 'ready' | 'speaking'

export interface VoiceTask {
  id:                  string
  caseId:              string
  rawTranscript:       string
  correctedTranscript: string
  confirmed:           boolean
  createdAt:           string
}

// ── Approvals ─────────────────────────────────────────────────────────
export interface Approval {
  id:          string
  caseId:      string
  roundNumber: number
  roleName:    RoleName | 'architect'
  decision:    'approved' | 'needs_revision' | 'conditional'
  notes:       string
  createdAt:   string
}

// ── Workflow state (in-memory per case) ───────────────────────────────
export interface WorkflowState {
  caseId:          string
  currentPhase:    WorkflowPhase
  currentRound:    number
  activeComments:  number
  matchScore:      number         // Dashka ∩ Consultant agreement (0–1)
  consultantApproved: boolean
  dashkaApproved:     boolean
  readyForFinal:      boolean
  log:             WorkflowLogEntry[]
}

export type WorkflowPhase =
  | 'awaiting_task'
  | 'dashka_briefing'
  | 'claude_drafting'
  | 'consultant_review'
  | 'dashka_review'
  | 'computing_match'
  | 'claude_revision'
  | 'awaiting_architect'
  | 'approved'
  | 'exported'

export interface WorkflowLogEntry {
  ts:      string
  phase:   WorkflowPhase
  role:    RoleName | 'architect' | 'system'
  message: string
}

// ── API request/response shapes ───────────────────────────────────────
export interface CreateCaseRequest {
  title:        string
  jurisdiction: string
  documentType: DocumentType
  taskText:     string
  sourceText?:  string
}

export interface RunRoundRequest {
  caseId: string
  round:  number
  phase:  WorkflowPhase
}

export interface RoundResult {
  newVersion?:  DocumentVersion
  comments?:    ReviewComment[]
  matchScore?:  number
  phase:        WorkflowPhase
  message:      string
}
