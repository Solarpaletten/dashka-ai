/**
 * lib/ai/router.ts
 * Staged AI router: simple → single, medium → dual+early-exit, complex → triple
 * Includes: confidence fallback, 10% exploration, context compression
 */

import type { Message, AIProvider, RouterResponse } from './types'
import type { ProviderResult }                       from './openai'
import { callGPT }    from './openai'
import { callClaude } from './claude'
import { callOllama } from './ollama'
import { Config }     from './config'
import { estimateCost } from './metrics'

// ── PROVIDERS map (plugin-ready) ──────────────────────────────────────
const PROVIDERS: Record<AIProvider, (msgs: Message[], ctx?: string | null) => Promise<ProviderResult>> = {
  gpt:    callGPT,
  claude: callClaude,
  ollama: callOllama
}

async function callProvider(provider: AIProvider, msgs: Message[], ctx?: string | null): Promise<ProviderResult> {
  const fn = PROVIDERS[provider]
  if (!fn) throw new Error(`Unknown provider: ${provider}`)
  return fn(msgs, ctx)
}

// ── Complexity tokens ──────────────────────────────────────────────────
const T = {
  code:   ['код','code','function','class','api','sql','debug','error','refactor',
           'typescript','python','react','algorithm','regex','endpoint','hook','async'],
  fast:   ['привет','hello','hi','что такое','what is','who is','когда','when',
           'где','where','how many','сколько'],
  dual:   ['объясни','explain','анализ','analysis','compare','сравни','почему',
           'why','стратегия','strategy','pros','cons','vs','versus'],
  triple: ['сравни все','compare all','лучший ai','best ai','all models','battle','поединок']
}

type Complexity = 'simple' | 'medium' | 'complex'

export function scoreComplexity(msg: string): Complexity {
  const m = msg.toLowerCase()
  if (T.triple.some(t => m.includes(t)))   return 'complex'
  if (T.code.some(t => m.includes(t)))     return 'medium'
  if (T.fast.some(t => m.includes(t)))     return 'simple'
  if (T.dual.some(t => m.includes(t)))     return 'medium'
  if (msg.length < 80)                     return 'simple'
  return msg.length > 150 ? 'medium' : 'simple'
}

export function categorise(msg: string): string {
  const m = msg.toLowerCase()
  if (T.code.some(t => m.includes(t)))   return 'code'
  if (T.dual.some(t => m.includes(t)))   return 'analysis'
  if (T.fast.some(t => m.includes(t)))   return 'factual'
  if (T.triple.some(t => m.includes(t))) return 'comparison'
  return msg.length > 200 ? 'deep' : 'general'
}

function defaultSingleProvider(msg: string): AIProvider {
  return T.code.some(t => msg.toLowerCase().includes(t)) ? 'claude' : 'gpt'
}

// ── Exploration (10%) ─────────────────────────────────────────────────
function maybeExplore(provider: AIProvider): { provider: AIProvider; explored: boolean } {
  if (Math.random() < Config.router.exploreRate) {
    const others: AIProvider[] = (['gpt', 'claude'] as AIProvider[]).filter(p => p !== provider)
    return { provider: others[Math.floor(Math.random() * others.length)], explored: true }
  }
  return { provider, explored: false }
}

// ── Context compression ───────────────────────────────────────────────
async function compressContext(messages: Message[]): Promise<Message[]> {
  const { compressAfter, keepRecent } = Config.router
  if (messages.length <= compressAfter) return messages

  const older  = messages.slice(0, messages.length - keepRecent)
  const recent = messages.slice(-keepRecent)

  const transcript = older
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n')

  try {
    const result = await callGPT([{
      role: 'user',
      content: `Summarise this conversation history concisely (max 150 words):\n\n${transcript}`
    }], null)

    if (!result.text) return messages

    console.log(`[router] compressed ${older.length} msgs → summary`)
    return [
      { role: 'user', content: `[CONVERSATION SUMMARY]\n${result.text}\n[END SUMMARY]` },
      ...recent
    ]
  } catch {
    return messages.slice(-keepRecent) // fallback: trim
  }
}

// ── Trim shared context ───────────────────────────────────────────────
function trimContext(ctx?: string | null): string | null {
  if (!ctx) return null
  return ctx.split('\n').filter(Boolean).slice(-Config.router.ctxWindow).join('\n')
}

// ── Safe call ─────────────────────────────────────────────────────────
async function safe(fn: () => Promise<ProviderResult>): Promise<ProviderResult | null> {
  try { return await fn() }
  catch (e) { console.error('[safeCall]', (e as Error).message); return null }
}

// ── Judge ──────────────────────────────────────────────────────────────
interface Candidate { provider: AIProvider; text: string }
interface JudgeResult extends Candidate { confidence: number }

async function judge(question: string, candidates: Record<string, Candidate>): Promise<JudgeResult> {
  const keys  = Object.keys(candidates)
  const block = keys.map(k => `ANSWER ${k} (${candidates[k].provider.toUpperCase()}):\n${candidates[k].text}`).join('\n\n')

  const prompt = `You are an expert AI evaluator.
QUESTION: ${question.slice(0, 500)}
${block}
Rate on: accuracy, completeness, clarity.
Respond ONLY with JSON: {"winner":"<${keys.join('|')}>","confidence":<0.0-1.0>}`

  try {
    const r = await callGPT([{ role: 'user', content: prompt }])
    const parsed = JSON.parse(r.text.replace(/```json|```/g, '').trim())
    const winner = candidates[parsed.winner]
    if (!winner) throw new Error('bad key')
    const confidence = Math.min(1, Math.max(0, parseFloat(parsed.confidence) || 0.7))
    return { ...winner, confidence }
  } catch {
    // Fallback: longest answer
    const best = keys.reduce((a, b) => candidates[a].text.length >= candidates[b].text.length ? a : b)
    return { ...candidates[best], confidence: 0.6 }
  }
}

// ── Main router ───────────────────────────────────────────────────────
export async function route(
  rawMessages: Message[],
  rawContext?: string | null
): Promise<RouterResponse & { cost_usd: number; tokens: number; category: string; explore: boolean }> {
  const t0      = Date.now()
  const ctx     = trimContext(rawContext)
  const messages = await compressContext(rawMessages)
  const lastUser = [...messages].reverse().find(m => m.role === 'user')?.content ?? ''
  const category  = categorise(lastUser)
  const complexity = scoreComplexity(lastUser)
  const { dualEnabled, confidenceFloor } = Config.router
  const ollamaEnabled = Config.ollama.enabled
  const ms = () => Date.now() - t0

  // ── SIMPLE → single ─────────────────────────────────────────────────
  if (complexity === 'simple') {
    const base = defaultSingleProvider(lastUser)
    const { provider, explored } = maybeExplore(base)

    const result = await callProvider(provider, messages, ctx)
    return {
      reply: result.text, provider, mode: explored ? 'explore' : 'single',
      complexity, confidence: null, latency_ms: ms(),
      cost_usd: result.cost_usd, tokens: result.tokens.total,
      category, explore: explored
    }
  }

  // ── MEDIUM → dual + confidence fallback ─────────────────────────────
  if (complexity === 'medium') {
    if (!dualEnabled) {
      const r = await callProvider('claude', messages, ctx)
      return {
        reply: r.text, provider: 'claude', mode: 'single',
        complexity, confidence: null, latency_ms: ms(),
        cost_usd: r.cost_usd, tokens: r.tokens.total, category, explore: false
      }
    }

    const [gRes, cRes] = await Promise.all([
      safe(() => callProvider('gpt',    messages, ctx)),
      safe(() => callProvider('claude', messages, ctx))
    ])

    if (!gRes && !cRes) throw new Error('All providers failed')
    if (!gRes) return { reply: cRes!.text, provider: 'claude', mode: 'dual', complexity, confidence: null, latency_ms: ms(), cost_usd: cRes!.cost_usd, tokens: cRes!.tokens.total, category, explore: false }
    if (!cRes) return { reply: gRes.text,  provider: 'gpt',    mode: 'dual', complexity, confidence: null, latency_ms: ms(), cost_usd: gRes.cost_usd,  tokens: gRes.tokens.total,  category, explore: false }

    const best = await judge(lastUser, {
      A: { provider: 'gpt',    text: gRes.text },
      B: { provider: 'claude', text: cRes.text }
    })

    // Confidence fallback: if judge is unsure, prefer the longer/more complete answer
    const confidence = best.confidence
    let finalProvider = best.provider
    let finalText     = best.text
    if (confidence < confidenceFloor) {
      // Pick by length as a heuristic for completeness
      finalProvider = gRes.text.length >= cRes.text.length ? 'gpt' : 'claude'
      finalText     = finalProvider === 'gpt' ? gRes.text : cRes.text
    }

    const winnerCost = finalProvider === 'gpt' ? gRes.cost_usd : cRes.cost_usd
    const winnerTok  = finalProvider === 'gpt' ? gRes.tokens.total : cRes.tokens.total

    return {
      reply: finalText, provider: finalProvider, mode: 'dual',
      complexity, confidence, latency_ms: ms(),
      cost_usd: gRes.cost_usd + cRes.cost_usd + winnerCost,
      tokens: gRes.tokens.total + cRes.tokens.total,
      category, explore: false,
      both: { gpt: gRes.text, claude: cRes.text }
    }
  }

  // ── COMPLEX → triple (with SLA budget) ──────────────────────────────
  const results: Partial<Record<AIProvider, ProviderResult>> = {}
  const started = Date.now()

  await new Promise<void>(resolve => {
    const providers: AIProvider[] = ollamaEnabled ? ['gpt', 'claude', 'ollama'] : ['gpt', 'claude']
    let done = 0
    providers.forEach(prov => {
      safe(() => callProvider(prov, messages, ctx)).then(r => {
        if (r) results[prov] = r
        if (++done === providers.length) resolve()
      })
    })
    setTimeout(resolve, Config.router.triplebudgetMs)
  })

  if (!Object.keys(results).length) throw new Error('All providers failed')

  const cands: Record<string, Candidate> = {}
  let totalCost = 0, totalTokens = 0
  Object.entries(results).forEach(([prov, r], i) => {
    cands[String.fromCharCode(65 + i)] = { provider: prov as AIProvider, text: r!.text }
    totalCost   += r!.cost_usd
    totalTokens += r!.tokens.total
  })

  const best = Object.keys(cands).length > 1
    ? await judge(lastUser, cands)
    : { ...Object.values(cands)[0], confidence: 0.6 }

  return {
    reply: best.text, provider: best.provider, mode: 'triple',
    complexity, confidence: best.confidence, latency_ms: ms(),
    cost_usd: totalCost, tokens: totalTokens,
    category, explore: false,
    both: {
      gpt:    results.gpt?.text,
      claude: results.claude?.text,
      ollama: results.ollama?.text ?? null
    }
  }
}
