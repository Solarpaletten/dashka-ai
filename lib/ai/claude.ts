import type { Message } from './types'
import { Config }       from './config'
import { estimateCost, estimateTokens } from './metrics'
import type { ProviderResult } from './openai'

const SYSTEM = "You are Claude by Anthropic. Be thoughtful and precise. Reply in the user's language."

export async function callClaude(
  messages: Message[],
  context?: string | null,
  timeoutMs?: number   // optional override — if not set, no timeout (for legal docs)
): Promise<ProviderResult> {
  const { apiKey, model } = Config.anthropic
  const system = context ? `${SYSTEM}\n\n[SHARED CONTEXT]\n${context}` : SYSTEM

  const fetchOptions: RequestInit = {
    method: 'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type':      'application/json'
    },
    body: JSON.stringify({ model, max_tokens: 2000, system, messages })
  }

  // Only apply timeout if explicitly requested
  if (timeoutMs) {
    fetchOptions.signal = AbortSignal.timeout(timeoutMs)
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', fetchOptions)

  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`)

  const data = await res.json()
  const text = data.content?.[0]?.text?.trim() ?? ''

  const tokens = {
    prompt:     data.usage?.input_tokens  ?? estimateTokens(messages.map(m => m.content).join('')),
    completion: data.usage?.output_tokens ?? estimateTokens(text),
    total:      (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0)
  }

  return { text, tokens, cost_usd: estimateCost('claude', tokens.prompt, tokens.completion) }
}
