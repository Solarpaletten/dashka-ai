import { NextResponse } from 'next/server'
import { getDb } from '@/lib/landing-db'

/**
 * POST /api/send-email — waitlist signup.
 * Stores email in local SQLite (./data/waitlist.db), keeps console.log.
 */

export const runtime = 'nodejs'

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254
}

export async function POST(req: Request) {
  try {
    const body  = await req.json().catch(() => null) as { email?: unknown; source?: unknown } | null
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''

    if (!email)             return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
    if (!isValidEmail(email)) return NextResponse.json({ error: 'Please enter a valid email.' }, { status: 400 })

    const db = await getDb()
    await db.execute({
      sql: 'INSERT INTO waitlist (email) VALUES (?)',
      args: [email],
    })

    console.log('[waitlist] signup', { email, ts: new Date().toISOString() })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[waitlist] error', err)
    return NextResponse.json({ error: 'Server error. Please try again.' }, { status: 500 })
  }
}
