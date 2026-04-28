import type { Message } from './types'
import { Config }       from './config'
import { estimateTokens } from './metrics'
import type { ProviderResult } from './openai'

function buildPrompt(messages: Message[], context?: string | null): string {
  const lines: string[] = []
  if (context) { lines.push('[SHARED CONTEXT]', context, '') }
  for (const m of messages) {
    lines.push(`${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
  }
  lines.push('Assistant:')
  return lines.join('\n')
}

export async function callOllama(
  messages: Message[],
  context?: string | null
): Promise<ProviderResult> {
  const { url, model, enabled, timeout } = Config.ollama
  if (!enabled) throw new Error('Ollama disabled (OLLAMA_ENABLED != true)')

  const res = await fetch(`${url}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: buildPrompt(messages, context),
      stream: false,
      options: { temperature: 0.7, num_predict: 800 }
    }),
    signal: AbortSignal.timeout(timeout)
  })

  if (!res.ok) throw new Error(`Ollama ${res.status}`)

  const data = await res.json()
  const text = (data.response ?? '').trim() || 'No response'
  const promptTok = estimateTokens(messages.map(m => m.content).join(''))
  const completionTok = estimateTokens(text)

  return {
    text,
    tokens: { prompt: promptTok, completion: completionTok, total: promptTok + completionTok },
    cost_usd: 0   // local model = free
  }
}
