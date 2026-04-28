import { NextResponse } from 'next/server'
import { getDb } from '@/lib/landing-db'

/**
 * POST /api/track — lightweight event tracking.
 * Body: { event: string }
 * Currently allowed: hero_cta_click, waitlist_submit
 */

export const runtime = 'nodejs'

const ALLOWED = new Set(['hero_cta_click', 'waitlist_submit'])

export async function POST(req: Request) {
  try {
    const body  = await req.json().catch(() => null) as { event?: unknown } | null
    const event = typeof body?.event === 'string' ? body.event : ''

    if (!ALLOWED.has(event))
      return NextResponse.json({ error: 'Unknown event.' }, { status: 400 })

    const db = await getDb()
    await db.execute({
      sql: 'INSERT INTO events (event) VALUES (?)',
      args: [event],
    })

    console.log('[track]', event, new Date().toISOString())

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[track] error', err)
    return NextResponse.json({ error: 'Server error.' }, { status: 500 })
  }
}
