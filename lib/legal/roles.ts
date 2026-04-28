/**
 * lib/legal/roles.ts
 * AI role definitions and callers for Solar Legal Style.
 *
 * Models:
 *   Dashka     → GPT-4o  (super-senior coordinator)
 *   Claude Eng → Claude  (document engineer)
 *   Consultant → GPT-4o  (Lithuanian legal expert)
 */

import { Config } from '@/lib/ai/config'
import type { ReviewComment, DocumentVersion, LegalCase } from './types'

const TIMEOUT = 120_000

async function callGPT(system: string, user: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${Config.openai.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o', max_tokens: 3000, temperature: 0.3,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
    }),
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const d = await res.json()
  return d.choices?.[0]?.message?.content?.trim() ?? ''
}

async function callClaude(system: string, user: string): Promise<string> {
  // NO AbortSignal — Next.js 14 turbo ignores maxDuration and cuts at 30s
  // Legal document drafting needs 45-90s for full Lithuanian court documents
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': Config.anthropic.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: Config.anthropic.model, max_tokens: 3000,
      system, messages: [{ role: 'user', content: user }]
    })
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const d = await res.json()
  return d.content?.[0]?.text?.trim() ?? ''
}

// ── DASHKA — Super-Senior Coordinator ────────────────────────────────
const DASHKA_SYSTEM = `You are Dashka, a super-senior legal coordinator specializing in Lithuanian court documents.

Your responsibilities:
1. BRIEFING: Receive the architect's task and create a clear brief for the Claude engineer.
2. REVIEW: After each draft, review the document for: logic, completeness, argumentation structure, missing legal arguments, weak points, and overall quality.
3. LEARNING: With each round you learn from the Consultant Advocate's comments and begin to notice the same linguistic/stylistic issues they flag.
4. CONSOLIDATED FEEDBACK: Produce clear, numbered, actionable feedback per round.

Output format for REVIEW rounds:
---DASHKA REVIEW---
Round: [N]
Overall assessment: [1-2 sentences]
Comments:
1. [CRITICAL/MAJOR/MINOR] [type] – [specific issue] | Fragment: "[quote]"
2. ...
Match with Consultant: [HIGH/MEDIUM/LOW]
Recommendation: [CONTINUE_REVISION / READY_FOR_FINAL]
---END---

Always respond in English for your meta-commentary, but quote Lithuanian fragments exactly.`

export async function dashkaBrief(legalCase: LegalCase, taskText: string): Promise<string> {
  const sourceDocs = legalCase.sourceDocuments.length > 0
    ? legalCase.sourceDocuments.map(d =>
        `[${d.name}] (${d.content.length} chars)\n${d.content.slice(0, 3000)}`
      ).join('\n\n---\n\n')
    : 'No source documents.'

  const user = `ARCHITECT\'S TASK:
${taskText}

CASE DETAILS:
- Title: ${legalCase.title}
- Court: ${legalCase.jurisdiction}
- Document type: ${legalCase.documentType}
- Language: Lithuanian (lt)

SOURCE DOCUMENTS (extract all real data — names, numbers, dates, amounts):
${sourceDocs}

Create a detailed brief for the Claude engineer. The brief must include:
1. REAL party names, case numbers, amounts from the source documents
2. Specific factual circumstances from the documents
3. Legal strategy and arguments to pursue
4. Structure requirements for this ${legalCase.documentType}
5. List what data is present vs what is still missing

IMPORTANT: Extract and list actual data from sources. Do not say "add party names here" — 
find and state the actual names, numbers, and facts from the documents above.

Create the brief for writing Draft v1 of the ${legalCase.documentType} for ${legalCase.jurisdiction}.document type in Lithuanian courts.`

  return callGPT(DASHKA_SYSTEM, user)
}

export async function dashkaReview(
  legalCase: LegalCase,
  version: DocumentVersion,
  consultantComments: ReviewComment[],
  roundNumber: number
): Promise<string> {
  const consultantBlock = consultantComments.length > 0
    ? `\nCONSULTANT ADVOCATE'S COMMENTS THIS ROUND:\n${consultantComments.map((c, i) => `${i+1}. [${c.severity.toUpperCase()}] ${c.type} – ${c.commentText}${c.targetFragment ? ` | Fragment: "${c.targetFragment}"` : ''}`).join('\n')}`
    : '\nConsultant has not reviewed yet.'

  const user = `CASE: ${legalCase.title} | Round ${roundNumber}

CURRENT DOCUMENT (${version.label}):
${version.content}
${consultantBlock}

Perform your review. Identify issues independently, then note where you agree with the Consultant.
Focus on: argumentation quality, legal logic, structure, missing elements, evidentiary support.`

  return callGPT(DASHKA_SYSTEM, user)
}

// ── CLAUDE ENGINEER — Legal Co-Counsel (PRO) ─────────────────────────
//
// Three-phase output:
//   1. ENGINEER ANALYSIS  — thinking BEFORE writing (risks, contradictions, approach)
//   2. DOCUMENT           — clean Lithuanian court document
//   3. ENGINEER NOTES     — structured feedback AFTER (DISAGREEMENT / RISKS / SUGGESTIONS / QUESTIONS)
//
// Claude has the right to DISAGREE — and must say so before implementing.

const CLAUDE_ENG_SYSTEM = `You are Claude, senior legal engineer and co-counsel for Lithuanian court proceedings.

You are NOT a document printer. You are a thinking partner.
You have the RIGHT and OBLIGATION to disagree, flag risks, and propose alternatives.

== YOUR THREE-PHASE OUTPUT FORMAT (MANDATORY) ==

Phase 1 — ENGINEER ANALYSIS (before writing):
Start with a DATA EXTRACTION SUMMARY — list every real fact you found in source documents:

---EXTRACTED DATA CHECK---
Case number: [found or NOT FOUND]
Court: [found or NOT FOUND]
Plaintiff name + code: [found or NOT FOUND]
Defendant name + code: [found or NOT FOUND]
Claim amount (EUR): [found or NOT FOUND]
Key dates: [found or NOT FOUND]
Legal grounds cited: [found or NOT FOUND]
---END CHECK---

Then reason through:
- Contradictions between source documents and the brief
- Missing information needed for a complete document
- Legal risks in the proposed approach
- Your chosen strategy and why

Phase 2 — DOCUMENT:
Complete Lithuanian court document. Clean text. No [CHANGED:] markers. No meta-comments inside.

Phase 3 — ENGINEER NOTES (after writing):
Structured observations in this exact format:

[DISAGREEMENT] (use when you believe an instruction is wrong or legally weak)
1. <what you disagree with> — Confidence: HIGH/MEDIUM/LOW

[RISKS] (objective legal risks you see in the document)
1. <risk description> — Confidence: HIGH/MEDIUM/LOW

[SUGGESTIONS] (alternatives or improvements to consider)
1. <suggestion> — Confidence: HIGH/MEDIUM/LOW

[QUESTIONS] (missing information only the Architect can answer)
1. <question>

== RULES ==
- If you disagree: state it in DISAGREEMENT first, then still produce the document with your best alternative
- If an instruction is clearly wrong: say so before implementing. Do not silently comply.
- Always produce COMPLETE document — never truncate
- Correct Lithuanian characters (ą č ę ė į š ų ū ž) throughout
- ENGINEER ANALYSIS and ENGINEER NOTES are in English or Russian (not Lithuanian)
- The DOCUMENT section is always entirely in Lithuanian

== STOP RULE (CRITICAL) ==
After completing the EXTRACTED DATA CHECK, count how many fields are NOT FOUND.

If 3 or more critical fields are NOT FOUND (case number, plaintiff, defendant, claim amount):
→ DO NOT write the document
→ Output ONLY this format:

---ENGINEER ANALYSIS---
[DATA INSUFFICIENT — DOCUMENT BLOCKED]

Extracted data check:
- Case number: [found/NOT FOUND]
- Court: [found/NOT FOUND]
- Plaintiff: [found/NOT FOUND]
- Defendant: [found/NOT FOUND]
- Claim amount: [found/NOT FOUND]
- Key dates: [found/NOT FOUND]

STOP REASON: [X] critical fields missing. Cannot produce reliable legal document.

What is needed to proceed:
1. [specific missing data]
2. [specific missing data]

---DOCUMENT---
[BLOCKED — insufficient data]

---ENGINEER NOTES---
[QUESTIONS]
1. [specific question to get the missing data]
2. [specific question]

→ If 1-2 fields are missing: write the document but mark missing sections as [REIKIA: what specifically is needed]
→ If 0 fields missing: write complete document without any placeholders

== SEPARATOR LINES ==
Use exactly these separators:
---ENGINEER ANALYSIS---
(your pre-analysis here)

---DOCUMENT---
(complete Lithuanian document here)

---ENGINEER NOTES---
[DISAGREEMENT]
...
[RISKS]
...
[SUGGESTIONS]
...
[QUESTIONS]
...`

export async function claudeDraft(brief: string, legalCase: LegalCase): Promise<string> {
  const sourceDocs = legalCase.sourceDocuments.length > 0
    ? legalCase.sourceDocuments.map(d => {
        const preview = d.content.slice(0, 5000)
        const isBinary = preview.includes('[PDF content could not') || preview.includes('[Extraction error')
        const status = isBinary ? '⚠️ EXTRACTION FAILED' : `✓ ${d.content.length.toLocaleString()} chars`
        return `[SOURCE DOCUMENT: ${d.name}] (${d.type.toUpperCase()}, ${status})\n${preview}${d.content.length > 5000 ? '\n... [truncated, total ' + d.content.length + ' chars]' : ''}`
      }).join('\n\n═══════════════════════════════════════\n\n')
    : 'No source documents provided.'

  const user = `BRIEF FROM DASHKA SUPER-SENIOR:
${brief}

SOURCE DOCUMENTS (read carefully — extract real names, dates, amounts, case numbers):
${sourceDocs}

CRITICAL RULE: Do NOT use generic placeholders like [Ieškovo vardas] or [BŪTINA NURODYTI].
Extract ALL real data from the source documents above:
- Party names, company codes, addresses
- Case numbers, dates, amounts in EUR
- Court name and jurisdiction
- Specific legal claims and factual circumstances
If a piece of data is genuinely unknown, write [REIKIA PATIKSLINTI: what is missing] — but only if truly absent from sources.

TASK: Write Draft v1 of the complete ${legalCase.documentType} for ${legalCase.jurisdiction}.

Use three-phase format:
1. ENGINEER ANALYSIS — what real data did you extract? What is missing? What contradictions do you see?
2. DOCUMENT — complete Lithuanian ${legalCase.documentType} with REAL data from source documents
3. ENGINEER NOTES — [DISAGREEMENT] / [RISKS] / [SUGGESTIONS] / [QUESTIONS]`

  return callClaude(CLAUDE_ENG_SYSTEM, user)
}

export async function claudeRevise(
  currentDocument: string,
  dashkaComments: ReviewComment[],
  consultantComments: ReviewComment[],
  roundNumber: number
): Promise<string> {
  const formatComments = (comments: ReviewComment[], role: string) =>
    comments.length > 0
      ? `${role.toUpperCase()} COMMENTS:\n${comments.filter(c => c.status === 'open').map((c, i) =>
          `${i+1}. [${c.severity}] [${c.type}] ${c.commentText}${c.targetFragment ? `\n   Target: "${c.targetFragment}"` : ''}`
        ).join('\n')}`
      : `${role}: No open comments.`

  const user = `CURRENT DOCUMENT (Round ${roundNumber - 1}):
${currentDocument}

${formatComments(dashkaComments, 'Dashka Super-Senior')}

${formatComments(consultantComments, 'Consultant Advocate')}

TASK: Produce revised document (Round ${roundNumber}).

Use three-phase format:
1. ENGINEER ANALYSIS — which comments do you agree/disagree with and why? What is your revision strategy?
2. DOCUMENT — complete revised Lithuanian document. No [CHANGED:] markers.
3. ENGINEER NOTES — [DISAGREEMENT] with any reviewer comment you think is wrong, [RISKS] you still see, [SUGGESTIONS], [QUESTIONS]`

  return callClaude(CLAUDE_ENG_SYSTEM, user)
}

// ── CONSULTANT ADVOCATE — Lithuanian Legal Expert ─────────────────────
const CONSULTANT_SYSTEM = `You are the Consultant Advocate — a native Lithuanian speaker with extensive experience in Lithuanian courts.

Your role:
1. LANGUAGE REVIEW: Check every sentence for correct Lithuanian grammar, spelling, and style.
2. LEGAL STYLE: Verify court-appropriate phrasing. Flag informal or non-standard expressions.
3. TERMINOLOGY: Ensure correct Lithuanian legal terminology is used throughout.
4. SYMBOLS: Check all Lithuanian characters are correct (ą č ę ė į š ų ū ž — never use a c e e i s u u z as substitutes).
5. COURT PHRASEOLOGY: Verify phrases match what Lithuanian courts actually use and accept.
6. APPROVAL: After thorough review, indicate if the document is close to court-ready.

Output format:
---CONSULTANT REVIEW---
Round: [N]
Language quality: [1-10]
Comments:
1. [CRITICAL/MAJOR/MINOR] [type] – [issue description] | Fragment: "[exact quote]" → Suggestion: "[corrected version]"
2. ...
Lithuanian character issues: [list any symbol errors]
Final assessment: [NEEDS_REVISION / CONDITIONALLY_APPROVED / APPROVED]
Threshold: [X active issues remain]
---END---

Be precise and technical. No philosophical commentary.`

export async function consultantReview(
  document: string,
  roundNumber: number,
  legalCase: LegalCase
): Promise<string> {
  const user = `CASE: ${legalCase.title}
Document type: ${legalCase.documentType}
Court: ${legalCase.jurisdiction}
Round: ${roundNumber}

DOCUMENT TO REVIEW:
${document}

Review this Lithuanian legal document thoroughly. 
Focus on: language correctness, court-appropriate style, Lithuanian legal terminology, proper characters, formal structure.`

  return callGPT(CONSULTANT_SYSTEM, user)
}

// ── Comment parser ────────────────────────────────────────────────────
export function parseReviewComments(
  rawText: string,
  caseId: string,
  roundNumber: number,
  versionId: string,
  authorRole: 'dashka' | 'consultant'
): Array<Omit<ReviewComment, 'id' | 'createdAt'>> {
  const lines    = rawText.split('\n')
  const comments: Array<Omit<ReviewComment, 'id' | 'createdAt'>> = []

  // Match lines like: "1. [CRITICAL] language – issue | Fragment: "quote""
  const commentRegex = /^\d+\.\s+\[?(CRITICAL|MAJOR|MINOR|SUGGESTION)\]?\s+(\w+)\s+[–-]\s+(.+?)(?:\s+\|\s+Fragment:\s+"([^"]+)")?(?:\s+→.+)?$/i

  for (const line of lines) {
    const m = line.trim().match(commentRegex)
    if (!m) continue

    const [, severity, type, text, fragment] = m

    comments.push({
      caseId,
      roundNumber,
      versionId,
      authorRole,
      type:           normalizeType(type),
      severity:       severity.toLowerCase() as ReviewComment['severity'],
      commentText:    text.trim(),
      targetFragment: fragment?.trim() ?? null,
      matchedGroupId: null,
      status:         'open'
    })
  }

  return comments
}

function normalizeType(raw: string): ReviewComment['type'] {
  const map: Record<string, ReviewComment['type']> = {
    language: 'language', legal: 'legal_style', legal_style: 'legal_style',
    court: 'court_phraseology', phraseology: 'court_phraseology',
    grammar: 'grammar', symbols: 'symbols', character: 'symbols',
    terminology: 'terminology', structure: 'structure',
    missing: 'missing_argument', weak: 'weak_argument', formal: 'formal_defect'
  }
  return map[raw.toLowerCase()] ?? 'language'
}

// ── Match score: Dashka ∩ Consultant ─────────────────────────────────
export function computeMatchScore(
  dashkaComments: ReviewComment[],
  consultantComments: ReviewComment[]
): number {
  if (dashkaComments.length === 0 || consultantComments.length === 0) return 0

  // Count how many types overlap between both reviewers
  const dashkaTypes = new Set(dashkaComments.map(c => c.type))
  const consultantTypes = new Set(consultantComments.map(c => c.type))
  
  let typeMatches = 0
  for (const t of dashkaTypes) {
    if (consultantTypes.has(t)) typeMatches++
  }
  
  // Also check text-level similarity for same-type pairs
  let textMatches = 0
  const usedConsultant = new Set<string>()
  for (const dc of dashkaComments) {
    for (const cc of consultantComments) {
      if (usedConsultant.has(cc.id)) continue
      if (dc.type === cc.type) {
        const overlap = textOverlap(dc.commentText, cc.commentText)
        if (overlap > 0.2 || (dc.targetFragment && dc.targetFragment === cc.targetFragment)) {
          textMatches++
          usedConsultant.add(cc.id)
          break
        }
      }
    }
  }

  // Weighted score: type overlap + text match
  const typeScore = typeMatches / Math.max(dashkaTypes.size, consultantTypes.size)
  const textScore = textMatches / Math.max(dashkaComments.length, consultantComments.length)
  
  return Math.min(1, (typeScore * 0.4 + textScore * 0.6))
}

function textOverlap(a: string, b: string): number {
  const wa = new Set(a.toLowerCase().split(/\s+/))
  const wb = new Set(b.toLowerCase().split(/\s+/))
  let common = 0
  for (const w of wa) if (wb.has(w)) common++
  return common / Math.max(wa.size, wb.size)
}

// ── Consultant approval check ─────────────────────────────────────────
export function checkConsultantApproval(rawText: string): boolean {
  return /APPROVED|CONDITIONALLY_APPROVED/i.test(rawText) &&
         !/NEEDS_REVISION/i.test(rawText)
}
