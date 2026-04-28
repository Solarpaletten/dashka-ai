/**
 * POST /api/stream
 * Body: { messages, context, provider: "gpt" | "claude" }
 * Returns: Server-Sent Events
 *   data: {"token":"..."}
 *   data: [DONE]
 */

import { NextResponse }   from 'next/server'
import { Config }         from '@/lib/ai/config'
import type { AIRequest, AIProvider } from '@/lib/ai/types'
import type { Message }   from '@/lib/ai/types'

const SYSTEM: Record<string, string> = {
  gpt:    "You are ChatGPT by OpenAI. Be direct and concise. Reply in the user's language.",
  claude: "You are Claude by Anthropic. Be thoughtful and precise. Reply in the user's language."
}

function buildSystem(provider: string, context?: string | null): string {
  const base = SYSTEM[provider] ?? SYSTEM.claude
  return context ? `${base}\n\n[SHARED CONTEXT]\n${context}` : base
}

// ── GPT streaming generator ────────────────────────────────────────────
async function* streamGPT(
  messages: Message[],
  context: string | null | undefined,
  abort: AbortSignal
): AsyncGenerator<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Config.openai.apiKey}`,
      'Content-Type':  'application/json'
    },
    body: JSON.stringify({
      model:    Config.openai.model,
      stream:   true,
      messages: [{ role: 'system', content: buildSystem('gpt', context) }, ...messages]
    }),
    signal: abort   // ← AbortController signal wired in
  })

  if (!res.ok || !res.body) throw new Error(`OpenAI stream ${res.status}`)

  const reader  = res.body.getReader()
  const decoder = new TextDecoder()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done || abort.aborted) break

      for (const line of decoder.decode(value, { stream: true }).split('\n')) {
        const t = line.trim()
        if (!t.startsWith('data:')) continue
        const d = t.slice(5).trim()
        if (d === '[DONE]') return
        try {
          const token = JSON.parse(d)?.choices?.[0]?.delta?.content
          if (token) yield token
        } catch { /* skip */ }
      }
    }
  } finally {
    reader.cancel()
  }
}

// ── Claude streaming generator ─────────────────────────────────────────
async function* streamClaude(
  messages: Message[],
  context: string | null | undefined,
  abort: AbortSignal
): AsyncGenerator<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         Config.anthropic.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type':      'application/json'
    },
    body: JSON.stringify({
      model:      Config.anthropic.model,
      max_tokens: 1000,
      stream:     true,
      system:     buildSystem('claude', context),
      messages
    }),
    signal: abort   // ← AbortController signal wired in
  })

  if (!res.ok || !res.body) throw new Error(`Anthropic stream ${res.status}`)

  const reader  = res.body.getReader()
  const decoder = new TextDecoder()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done || abort.aborted) break

      for (const line of decoder.decode(value, { stream: true }).split('\n')) {
        const t = line.trim()
        if (!t.startsWith('data:')) continue
        const d = t.slice(5).trim()
        try {
          const json = JSON.parse(d)
          if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
            yield json.delta.text
          }
          if (json.type === 'message_stop') return
        } catch { /* skip */ }
      }
    }
  } finally {
    reader.cancel()
  }
}

// ── Route handler ──────────────────────────────────────────────────────
export async function POST(req: Request) {
  let body: AIRequest & { provider?: AIProvider }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { messages, context, provider = 'claude' } = body
  if (!Array.isArray(messages) || !messages.length)
    return NextResponse.json({ error: 'messages[] required' }, { status: 400 })

  // AbortController that is cancelled when client disconnects
  const abort = new AbortController()
  req.signal.addEventListener('abort', () => abort.abort(), { once: true })

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(ctrl) {
      const emit = (data: unknown) =>
        ctrl.enqueue(encoder.encode(`data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`))

      try {
        const gen = provider === 'gpt'
          ? streamGPT(messages, context, abort.signal)
          : streamClaude(messages, context, abort.signal)

        for await (const token of gen) {
          if (abort.signal.aborted) break
          emit({ token })
        }
      } catch (e) {
        if (!abort.signal.aborted) {
          emit({ error: (e as Error).message })
        }
      } finally {
        emit('[DONE]')
        ctrl.close()
      }
    },
    cancel() { abort.abort() }
  })

  return new Response(stream, {
    headers: {
      'Content-Type':      'text/event-stream; charset=utf-8',
      'Cache-Control':     'no-cache, no-transform',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no'   // disable Nginx buffering
    }
  })
}
