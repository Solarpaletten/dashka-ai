import { NextResponse } from 'next/server'
import { getMetrics }   from '@/lib/ai/metrics'

export async function GET() {
  return NextResponse.json(getMetrics())
}

export async function DELETE() {
  const { resetMetrics } = await import('@/lib/ai/metrics')
  resetMetrics()
  return NextResponse.json({ ok: true, message: 'Metrics reset' })
}
