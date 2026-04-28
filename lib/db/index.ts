/**
 * lib/db/index.ts — Turso / SQLite persistence
 *
 * Local:  DATABASE_URL=file:./data/solar_legal.db  (auto-created, no token needed)
 * Turso:  DATABASE_URL=libsql://...turso.io  +  DATABASE_AUTH_TOKEN=eyJ...
 */

import { createClient, type Client } from '@libsql/client'
import path from 'path'
import fs   from 'fs'

function makeClient(): Client {
  // Support both naming conventions (Turso CLI uses TURSO_*, we also accept DATABASE_*)
  const url   = process.env.DATABASE_URL ?? process.env.TURSO_DATABASE_URL ?? ''
  const token = process.env.DATABASE_AUTH_TOKEN ?? process.env.TURSO_AUTH_TOKEN ?? ''

  const isRemote = url.startsWith('libsql://') || url.startsWith('https://')

  if (isRemote) {
    console.log('[db] Connecting to Turso:', url)
    return createClient({ url, authToken: token })
  }

  // Local SQLite fallback
  const dataDir = path.join(process.cwd(), 'data')
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
  const fileUrl = url.startsWith('file:') ? url : `file:${path.join(dataDir, 'solar_legal.db')}`
  console.log('[db] Using local SQLite:', fileUrl)
  return createClient({ url: fileUrl })
}

// Singleton — survives Next.js hot-reload
declare global { var __solar_db: Client | undefined }
export function db(): Client {
  if (!global.__solar_db) global.__solar_db = makeClient()
  return global.__solar_db
}

// Schema — promise cached globally, runs ONCE per process, zero overhead on repeat calls
let _schemaPromise: Promise<void> | null = null

export function ensureSchema(): Promise<void> {
  if (_schemaPromise) return _schemaPromise   // ← instant return, no await needed

  console.log('[db] Schema init start...')
  _schemaPromise = (async () => {
    const client = db()
    // Sequential execution — more reliable than batch on Turso cold start
    const stmts = [
      `CREATE TABLE IF NOT EXISTS cases (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      )`,
      `CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL,
        role_col TEXT NOT NULL,
        msg_role TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        ts INTEGER NOT NULL DEFAULT (unixepoch()),
        version INTEGER,
        edited INTEGER NOT NULL DEFAULT 0,
        parent_id TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS message_files (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL,
        name TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        size INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE INDEX IF NOT EXISTS idx_msg_case ON messages(case_id)`,
      `CREATE INDEX IF NOT EXISTS idx_files_msg ON message_files(message_id)`,
    ]
    for (const sql of stmts) {
      await client.execute({ sql, args: [] })
    }
    console.log('[db] Schema ready ✓')
  })()

  _schemaPromise.catch(e => {
    console.error('[db] Schema error:', e)
    _schemaPromise = null   // reset so next request retries
  })

  return _schemaPromise
}

// Kick off on module import — by the time first request arrives, schema is usually ready
ensureSchema()
