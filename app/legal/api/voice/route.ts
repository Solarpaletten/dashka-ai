/**
 * POST /legal/api/voice/transcribe  — audio → text via Whisper
 * POST /legal/api/voice/speak       — text → speech via OpenAI TTS
 */

import { NextResponse } from 'next/server'
import { Config }       from '@/lib/ai/config'
import { addVoiceTask } from '@/lib/legal/store'

// ── STT: Whisper transcription ─────────────────────────────────────────
export async function POST(req: Request) {
  const url = new URL(req.url)
  const action = url.searchParams.get('action') ?? 'transcribe'

  // ── Transcribe ──────────────────────────────────────────────────────
  if (action === 'transcribe') {
    try {
      const formData = await req.formData()
      const audio    = formData.get('audio') as Blob | null
      const caseId   = formData.get('caseId') as string | null

      if (!audio) return NextResponse.json({ error: 'audio required' }, { status: 400 })

      // Forward to OpenAI Whisper
      const whisperForm = new FormData()
      whisperForm.append('file', audio, 'recording.webm')
      whisperForm.append('model', 'whisper-1')
      whisperForm.append('language', 'lt')     // Lithuanian by default
      whisperForm.append('response_format', 'json')

      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${Config.openai.apiKey}` },
        body:    whisperForm
      })

      if (!res.ok) {
        const err = await res.text()
        return NextResponse.json({ error: `Whisper error: ${err.slice(0, 200)}` }, { status: 500 })
      }

      const data = await res.json()
      const transcript: string = data.text ?? ''

      // Store voice task if caseId provided
      if (caseId) {
        addVoiceTask({
          caseId,
          rawTranscript:       transcript,
          correctedTranscript: transcript,
          confirmed:           false
        })
      }

      return NextResponse.json({ transcript, language: 'lt' })

    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 })
    }
  }

  // ── TTS: Text to Speech ─────────────────────────────────────────────
  if (action === 'speak') {
    try {
      const { text, voice = 'nova', speed = 1.0 } = await req.json()
      if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 })

      const res = await fetch('https://api.openai.com/v1/audio/speech', {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${Config.openai.apiKey}`,
          'Content-Type':  'application/json'
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: text.slice(0, 4096),  // TTS limit
          voice,                        // alloy|echo|fable|onyx|nova|shimmer
          speed,
          response_format: 'mp3'
        })
      })

      if (!res.ok) {
        const err = await res.text()
        return NextResponse.json({ error: `TTS error: ${err.slice(0, 200)}` }, { status: 500 })
      }

      const audioBuffer = await res.arrayBuffer()
      return new Response(audioBuffer, {
        headers: {
          'Content-Type':  'audio/mpeg',
          'Cache-Control': 'no-cache'
        }
      })

    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 })
    }
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
}
