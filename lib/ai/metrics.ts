/**
 * lib/ai/metrics.ts
 * In-memory metrics store shared across API route calls (Node.js module singleton).
 * Resets on server restart — for persistent metrics use the Express v10 backend.
 */

export interface RequestRecord {
  provider:   string
  mode:       string
  category:   string
  latency_ms: number
  cost_usd:   number
  tokens:     number
  cached:     boolean
  error:      boolean
  ts:         number
}

interface ProviderStats {
  count:        number
  totalLatency: number
  totalCost:    number
  totalTokens:  number
}

// ── Module-level singleton ─────────────────────────────────────────────
const _records: RequestRecord[] = []
const _byProvider: Record<string, ProviderStats> = {}
const _byMode:     Record<string, number> = {}
const _byCategory: Record<string, number> = {}
const _byHour:     Record<string, number> = {}

let _cacheHits  = 0
let _errors     = 0
let _startedAt  = new Date().toISOString()

// ── Cost table (USD per 1M tokens) ────────────────────────────────────
const COST_PER_1M: Record<string, { prompt: number; completion: number }> = {
  'gpt-4o':            { prompt: 2.50,  completion: 10.00 },
  'gpt-4o-mini':       { prompt: 0.15,  completion:  0.60 },
  'claude-sonnet-4':   { prompt: 3.00,  completion: 15.00 },
  'ollama':            { prompt: 0,     completion:  0    }
}

export function estimateCost(
  provider: string,
  promptTokens = 0,
  completionTokens = 0
): number {
  const key =
    provider === 'gpt'    ? 'gpt-4o'          :
    provider === 'claude' ? 'claude-sonnet-4'  : 'ollama'
  const r = COST_PER_1M[key] ?? { prompt: 0, completion: 0 }
  return +((promptTokens * r.prompt + completionTokens * r.completion) / 1_000_000).toFixed(6)
}

export function estimateTokens(text = ''): number {
  return Math.ceil(text.length / 4)
}

// ── Record ─────────────────────────────────────────────────────────────
export function record(r: RequestRecord): void {
  _records.push(r)
  if (_records.length > 10_000) _records.shift()

  // provider stats
  if (!_byProvider[r.provider]) {
    _byProvider[r.provider] = { count: 0, totalLatency: 0, totalCost: 0, totalTokens: 0 }
  }
  const p = _byProvider[r.provider]
  p.count++;  p.totalLatency += r.latency_ms
  p.totalCost += r.cost_usd; p.totalTokens += r.tokens

  // mode / category
  _byMode[r.mode]         = (_byMode[r.mode]         ?? 0) + 1
  _byCategory[r.category] = (_byCategory[r.category] ?? 0) + 1

  // hourly bucket
  const hour = new Date(r.ts).toISOString().slice(0, 13)
  _byHour[hour] = (_byHour[hour] ?? 0) + 1
  // keep last 48h
  const hours = Object.keys(_byHour).sort()
  if (hours.length > 48) delete _byHour[hours[0]]

  if (r.cached) _cacheHits++
  if (r.error)  _errors++
}

// ── Getters ────────────────────────────────────────────────────────────
export function getMetrics() {
  const total   = _records.length || 1
  const latency = _records.reduce((s, r) => s + r.latency_ms, 0)
  const cost    = _records.reduce((s, r) => s + r.cost_usd,   0)

  const winRate: Record<string, number> = {}
  const avgLatency: Record<string, number> = {}
  const costByProvider: Record<string, number> = {}

  for (const [prov, s] of Object.entries(_byProvider)) {
    winRate[prov]        = +(s.count / Math.max(total, 1)).toFixed(3)
    avgLatency[prov]     = Math.round(s.totalLatency / Math.max(s.count, 1))
    costByProvider[prov] = +s.totalCost.toFixed(4)
  }

  return {
    requests:            _records.length,
    cacheHits:           _cacheHits,
    cacheHitRate:        +(_cacheHits / total).toFixed(3),
    errors:              _errors,
    avgLatency_ms:       Math.round(latency / total),
    totalCost_usd:       +cost.toFixed(4),
    avgCostPerReq_usd:   +(cost / total).toFixed(6),
    winRate,
    avgLatencyByProvider: avgLatency,
    costByProvider,
    byMode:     { ..._byMode },
    byCategory: { ..._byCategory },
    byHour:     { ..._byHour },
    uptimeSince: _startedAt
  }
}

export function resetMetrics(): void {
  _records.length = 0
  Object.keys(_byProvider).forEach(k => delete _byProvider[k])
  Object.keys(_byMode).forEach(k     => delete _byMode[k])
  Object.keys(_byCategory).forEach(k => delete _byCategory[k])
  Object.keys(_byHour).forEach(k     => delete _byHour[k])
  _cacheHits = 0; _errors = 0
  _startedAt = new Date().toISOString()
}
