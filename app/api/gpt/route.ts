import { NextResponse }    from 'next/server'
import { callGPT }         from '@/lib/ai/openai'
import { record }          from '@/lib/ai/metrics'
import type { AIRequest }  from '@/lib/ai/types'

export async function POST(req: Request) {
  const t0 = Date.now()
  try {
    const body: AIRequest = await req.json()
    if (!Array.isArray(body.messages) || !body.messages.length)
      return NextResponse.json({ error: 'messages[] required' }, { status: 400 })

    const result = await callGPT(body.messages, body.context)

    record({ provider: 'gpt', mode: 'direct', category: 'general',
      latency_ms: Date.now() - t0, cost_usd: result.cost_usd,
      tokens: result.tokens.total, cached: false, error: false, ts: Date.now() })

    return NextResponse.json({ reply: result.text, provider: 'gpt', cost_usd: result.cost_usd })
  } catch (e) {
    record({ provider: 'gpt', mode: 'direct', category: 'general',
      latency_ms: Date.now() - t0, cost_usd: 0, tokens: 0, cached: false, error: true, ts: Date.now() })
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
