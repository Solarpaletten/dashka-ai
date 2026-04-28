import type { Message } from './types'
import { Config }       from './config'
import { estimateCost, estimateTokens } from './metrics'

export interface ProviderResult {
  text:   string
  tokens: { prompt: number; completion: number; total: number }
  cost_usd: number
}

const SYSTEM = "You are ChatGPT by OpenAI. Be direct and concise. Reply in the user's language."

export async function callGPT(
  messages: Message[],
  context?: string | null
): Promise<ProviderResult> {
  const { apiKey, model, timeout } = Config.openai
  const system = context ? `${SYSTEM}\n\n[SHARED CONTEXT]\n${context}` : SYSTEM

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: 1000,
      messages: [{ role: 'system', content: system }, ...messages]
    }),
    signal: AbortSignal.timeout(timeout)
  })

  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`)

  const data = await res.json()
  const text = data.choices?.[0]?.message?.content?.trim() ?? ''

  const tokens = {
    prompt:     data.usage?.prompt_tokens     ?? estimateTokens(messages.map(m => m.content).join('')),
    completion: data.usage?.completion_tokens ?? estimateTokens(text),
    total:      data.usage?.total_tokens      ?? 0
  }

  return { text, tokens, cost_usd: estimateCost('gpt', tokens.prompt, tokens.completion) }
}
