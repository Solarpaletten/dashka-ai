import { createClient, type Client } from '@libsql/client'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Shared libsql client for the landing-side data:
 *   - waitlist signups
 *   - lightweight event tracking
 *
 * Stored locally in ./data/waitlist.db. To migrate to Turso later,
 * set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN — no other code changes needed.
 */

const url   = process.env.TURSO_DATABASE_URL  || 'file:./data/waitlist.db'
const token = process.env.TURSO_AUTH_TOKEN

// Ensure ./data exists for the local file backend.
if (url.startsWith('file:')) {
  const path = url.replace(/^file:/, '')
  try { mkdirSync(dirname(path), { recursive: true }) } catch { /* ok if exists */ }
}

let _client: Client | null = null
let _ready: Promise<void> | null = null

function getClient(): Client {
  if (!_client) _client = createClient({ url, authToken: token })
  return _client
}

async function ensureSchema(): Promise<void> {
  const c = getClient()
  await c.execute(`
    CREATE TABLE IF NOT EXISTS waitlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await c.execute(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)
}

/** Returns the libsql client, lazily initialising the schema on first use. */
export async function getDb(): Promise<Client> {
  if (!_ready) _ready = ensureSchema()
  await _ready
  return getClient()
}
