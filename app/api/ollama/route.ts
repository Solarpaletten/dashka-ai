import { NextResponse }  from 'next/server'
import { callOllama }    from '@/lib/ai/ollama'
import type { AIRequest } from '@/lib/ai/types'

export async function POST(req: Request) {
  if (process.env.OLLAMA_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Ollama not enabled' }, { status: 503 })
  }

  try {
    const body: AIRequest = await req.json()

    if (!Array.isArray(body.messages) || !body.messages.length) {
      return NextResponse.json({ error: 'messages[] required' }, { status: 400 })
    }

    const reply = await callOllama(body.messages, body.context)
    return NextResponse.json({ reply, provider: 'ollama' })

  } catch (e) {
    const msg = (e as Error).message
    console.error('[/api/ollama]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
