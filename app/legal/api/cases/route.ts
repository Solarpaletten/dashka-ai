import { NextResponse } from 'next/server'
import { createCase, listCases, getCase } from '@/lib/legal/store'
import type { CreateCaseRequest } from '@/lib/legal/types'

export async function GET() {
  return NextResponse.json(listCases())
}

export async function POST(req: Request) {
  try {
    const body: CreateCaseRequest = await req.json()
    if (!body.title || !body.taskText)
      return NextResponse.json({ error: 'title and taskText required' }, { status: 400 })

    const legalCase = createCase({
      title:        body.title,
      jurisdiction: body.jurisdiction ?? 'Vilniaus apygardos teismas',
      documentType: body.documentType ?? 'ieškinys',
      language:     'lt',
      status:       'task_received',
      taskText:     body.taskText,
    })

    // Optionally add pasted source text
    if (body.sourceText?.trim()) {
      legalCase.sourceDocuments.push({
        id:       Math.random().toString(36).slice(2),
        name:     'Pasted document',
        type:     'paste',
        content:  body.sourceText,
        addedAt:  new Date().toISOString()
      })
    }

    return NextResponse.json(legalCase, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
