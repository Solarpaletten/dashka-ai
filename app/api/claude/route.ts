import { NextResponse } from 'next/server'
import { record }       from '@/lib/ai/metrics'

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'

export async function POST(req: Request) {
  const t0 = Date.now()
  try {
    const body = await req.json()
    const { messages, system, stream: wantStream } = body

    if (!Array.isArray(messages) || !messages.length)
      return NextResponse.json({ error: 'messages[] required' }, { status: 400 })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })

    const systemPrompt = system || 'You are a helpful assistant.'

    // ── STREAMING ───────────────────────────────────────────────────────
    if (wantStream) {
      const upstreamRes = await fetch(ANTHROPIC_API, {
        method:  'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model:      'claude-sonnet-4-5',
          max_tokens: 4096,
          stream:     true,
          system:     systemPrompt,
          messages:   messages.map((m: { role: string; content: string }) => ({
            role:    m.role === 'ai' ? 'assistant' : m.role,
            content: m.content
          }))
        })
      })

      if (!upstreamRes.ok) {
        const err = await upstreamRes.json()
        return NextResponse.json({ error: err.error?.message ?? `API ${upstreamRes.status}` }, { status: 500 })
      }

      // Pipe SSE stream from Anthropic → client
      // We transform to simple newline-delimited text chunks
      const encoder = new TextEncoder()
      const readable = new ReadableStream({
        async start(controller) {
          const reader = upstreamRes.body!.getReader()
          const decoder = new TextDecoder()
          let inputTokens = 0, outputTokens = 0

          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break

              const chunk = decoder.decode(value, { stream: true })
              // Anthropic SSE lines: "data: {...}"
              for (const line of chunk.split('\n')) {
                if (!line.startsWith('data: ')) continue
                const raw = line.slice(6).trim()
                if (raw === '[DONE]') continue
                try {
                  const evt = JSON.parse(raw)
                  if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
                    // Send text chunk to client
                    controller.enqueue(encoder.encode(evt.delta.text))
                  }
                  if (evt.type === 'message_start') {
                    inputTokens = evt.message?.usage?.input_tokens ?? 0
                  }
                  if (evt.type === 'message_delta') {
                    outputTokens = evt.usage?.output_tokens ?? 0
                  }
                } catch { /* skip malformed JSON */ }
              }
            }
          } catch (streamErr: unknown) {
            // AbortError / ETIMEDOUT = client disconnected intentionally — not a real error
            const msg = streamErr instanceof Error ? streamErr.message : ''
            const isClientDisconnect = streamErr instanceof Error && (
              streamErr.name === 'AbortError' ||
              msg.includes('terminated') ||
              msg.includes('ETIMEDOUT') ||
              msg.includes('ECONNRESET') ||
              msg.includes('premature')
            )
            if (!isClientDisconnect) console.error('[stream] unexpected error:', streamErr)
          } finally {
            try { reader.cancel() } catch {}
            try { controller.close() } catch {}
            const cost = (inputTokens + outputTokens) * 0.000003
            record({ provider:'claude', mode:'stream', category:'legal',
              latency_ms: Date.now()-t0, cost_usd: cost,
              tokens: inputTokens + outputTokens, cached: false, error: false, ts: Date.now() })
          }
        }
      })

      return new Response(readable, {
        headers: {
          'Content-Type':      'text/plain; charset=utf-8',
          'Transfer-Encoding': 'chunked',
          'Cache-Control':     'no-cache',
          'X-Accel-Buffering': 'no',
        }
      })
    }

    // ── NON-STREAMING fallback ───────────────────────────────────────────
    const res = await fetch(ANTHROPIC_API, {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-5',
        max_tokens: 4096,
        system:     systemPrompt,
        messages:   messages.map((m: { role: string; content: string }) => ({
          role:    m.role === 'ai' ? 'assistant' : m.role,
          content: m.content
        }))
      })
    })
    const data   = await res.json()
    if (!res.ok) throw new Error(data.error?.message ?? `Anthropic API ${res.status}`)
    const text   = data.content?.[0]?.text ?? ''
    const tokens = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0)
    record({ provider:'claude', mode:'direct', category:'legal',
      latency_ms: Date.now()-t0, cost_usd: tokens*0.000003,
      tokens, cached: false, error: false, ts: Date.now() })
    return NextResponse.json({ content: [{ text }], reply: text, provider: 'claude', cost_usd: tokens*0.000003 })

  } catch (e) {
    record({ provider:'claude', mode:'direct', category:'legal',
      latency_ms: Date.now()-t0, cost_usd: 0, tokens: 0, cached: false, error: true, ts: Date.now() })
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
