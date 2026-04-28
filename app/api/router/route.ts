import { NextResponse }    from 'next/server'
import { route }           from '@/lib/ai/router'
import { record }          from '@/lib/ai/metrics'
import type { AIRequest }  from '@/lib/ai/types'

export async function POST(req: Request) {
  const t0 = Date.now()
  try {
    const body: AIRequest = await req.json()
    if (!Array.isArray(body.messages) || !body.messages.length)
      return NextResponse.json({ error: 'messages[] required' }, { status: 400 })

    const lastUser = [...body.messages].reverse().find(m => m.role === 'user')?.content ?? ''
    if (!lastUser.trim())
      return NextResponse.json({ error: 'Empty message' }, { status: 400 })

    const result = await route(body.messages, body.context)

    record({ provider: result.provider, mode: result.mode ?? 'single',
      category: result.category ?? 'general', latency_ms: Date.now() - t0,
      cost_usd: result.cost_usd, tokens: result.tokens,
      cached: false, error: false, ts: Date.now() })

    return NextResponse.json(result)
  } catch (e) {
    record({ provider: 'unknown', mode: 'error', category: 'general',
      latency_ms: Date.now() - t0, cost_usd: 0, tokens: 0,
      cached: false, error: true, ts: Date.now() })
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
