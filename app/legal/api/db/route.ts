/**
 * /legal/api/db — Case + Message persistence
 * GET  ?action=cases                           → list all cases
 * GET  ?action=case&id=xxx                     → case + messages + files
 * POST { action:'create', title }              → create case
 * POST { action:'upsert_msg', caseId, roleCol, msg } → save message
 * POST { action:'delete_msg', id }             → delete message
 * POST { action:'delete_case', id }            → delete case
 */
import { NextResponse } from 'next/server'
import { db, ensureSchema } from '@/lib/db'

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }

export async function GET(req: Request) {
  try {
    await ensureSchema()   // wait for tables to exist
    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action')
    const client = db()

    if (action === 'cases') {
      const res = await client.execute('SELECT id, title, created_at, updated_at FROM cases ORDER BY updated_at DESC')
      return NextResponse.json(res.rows)
    }

    if (action === 'case') {
      const id = searchParams.get('id')
      if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
      const [caseRow, msgs, files] = await Promise.all([
        client.execute({ sql: 'SELECT * FROM cases WHERE id=?', args: [id] }),
        client.execute({ sql: 'SELECT * FROM messages WHERE case_id=? ORDER BY ts', args: [id] }),
        client.execute({ sql: `SELECT mf.* FROM message_files mf JOIN messages m ON m.id=mf.message_id WHERE m.case_id=?`, args: [id] })
      ])
      if (!caseRow.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      const filesByMsg: Record<string, typeof files.rows> = {}
      for (const f of files.rows) {
        const mid = String(f.message_id)
        if (!filesByMsg[mid]) filesByMsg[mid] = []
        filesByMsg[mid].push(f)
      }
      const messages = msgs.rows.map(m => ({
        id: m.id, role_col: m.role_col, msg_role: m.msg_role,
        content: m.content, ts: Number(m.ts) * 1000,
        version: m.version, edited: Boolean(m.edited), parentId: m.parent_id,
        files: (filesByMsg[String(m.id)] ?? []).map(f => ({ fid: String(f.id), name: String(f.name), content: String(f.content), size: Number(f.size) }))
      }))
      return NextResponse.json({ ...caseRow.rows[0], messages })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }) }
}

export async function POST(req: Request) {
  try {
    await ensureSchema()   // wait for tables to exist
    const body = await req.json()
    const client = db()

    if (body.action === 'create') {
      const id = uid()
      await client.execute({ sql: 'INSERT INTO cases(id,title) VALUES(?,?)', args: [id, body.title || 'New Case'] })
      return NextResponse.json({ id, title: body.title })
    }

    if (body.action === 'upsert_msg') {
      const { caseId, roleCol, msg } = body
      await client.execute({ sql: 'UPDATE cases SET updated_at=unixepoch() WHERE id=?', args: [caseId] })
      await client.execute({
        sql: `INSERT INTO messages(id,case_id,role_col,msg_role,content,ts,version,edited,parent_id)
              VALUES(?,?,?,?,?,?,?,?,?)
              ON CONFLICT(id) DO UPDATE SET content=excluded.content,version=excluded.version,edited=excluded.edited,ts=excluded.ts`,
        args: [msg.id, caseId, roleCol, msg.role === 'ai' ? 'ai' : 'user', msg.content,
               Math.floor((msg.ts || Date.now()) / 1000), msg.version ?? null, msg.edited ? 1 : 0, msg.parentId ?? null]
      })
      await client.execute({ sql: 'DELETE FROM message_files WHERE message_id=?', args: [msg.id] })
      for (const f of (msg.files ?? [])) {
        await client.execute({ sql: 'INSERT INTO message_files(id,message_id,name,content,size) VALUES(?,?,?,?,?)', args: [f.fid || uid(), msg.id, f.name, f.content || '', f.size || 0] })
      }
      return NextResponse.json({ ok: true })
    }

    if (body.action === 'delete_msg') {
      await client.execute({ sql: 'DELETE FROM messages WHERE id=?', args: [body.id] })
      return NextResponse.json({ ok: true })
    }

    if (body.action === 'delete_case') {
      await client.execute({ sql: 'DELETE FROM cases WHERE id=?', args: [body.id] })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }) }
}
