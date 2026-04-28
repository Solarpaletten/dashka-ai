/**
 * lib/files.ts
 * Smart file extraction from AI responses.
 * Detects language, guesses filename, supports multi-file outputs.
 */

export interface ExtractedFile {
  lang:     string
  code:     string
  filename: string
  lines:    number
  size:     string    // human-readable e.g. "1.2 KB"
}

// ── Extension map ─────────────────────────────────────────────────────
const EXT: Record<string, string> = {
  typescript: 'ts', javascript: 'js', python: 'py',
  bash: 'sh', shell: 'sh', sh: 'sh',
  css: 'css', html: 'html', json: 'json',
  sql: 'sql', rust: 'rs', go: 'go',
  java: 'java', kotlin: 'kt', swift: 'swift',
  yaml: 'yml', yml: 'yml', toml: 'toml',
  markdown: 'md', md: 'md', txt: 'txt',
  dockerfile: 'dockerfile', docker: 'dockerfile',
  graphql: 'graphql', gql: 'graphql',
  tsx: 'tsx', jsx: 'jsx'
}

// ── Smart filename guesser ─────────────────────────────────────────────
function guessFilename(code: string, lang: string, index: number): string {
  // 1. Explicit comment at top: // file: index.ts  OR  # file: main.py
  const fileComment = code.match(/^(?:\/\/|#|<!--)\s*file[:\s]+(\S+)/im)
  if (fileComment) return fileComment[1].replace(/-->$/, '').trim()

  // 2. Explicit filename in first 3 lines: // index.ts
  const firstLines = code.split('\n').slice(0, 3).join('\n')
  const inlineFile = firstLines.match(/^(?:\/\/|#)\s*([\w.-]+\.[a-z]{1,10})\s*$/im)
  if (inlineFile) return inlineFile[1]

  const ext = EXT[lang.toLowerCase()] ?? lang ?? 'txt'

  // 3. Detect common patterns in code
  if (/export default function App|createRoot|ReactDOM/.test(code)) {
    return ext === 'tsx' ? 'App.tsx' : ext === 'jsx' ? 'App.jsx' : `app.${ext}`
  }
  if (/import.*from ['"]next\/|getServerSideProps|getStaticProps/.test(code)) {
    return `page.${ext}`
  }
  if (/fastapi|flask|express|app\.listen|server\.listen/.test(code.toLowerCase())) {
    return `server.${ext}`
  }
  if (/create table|select \*|insert into/i.test(code)) {
    return `query.${ext}`
  }
  if (/dockerfile/i.test(lang)) return 'Dockerfile'
  if (/package\.json|"name":.*"version":/.test(code)) return 'package.json'
  if (/^body\s*{|^:root\s*{/m.test(code)) return `styles.${ext}`
  if (/<html|<!doctype/i.test(code)) return `index.${ext}`
  if (/^#\s+|^##\s+/m.test(code) && ext === 'md') return 'README.md'

  // 4. Common per-language defaults
  const defaults: Record<string, string> = {
    ts: 'index.ts', tsx: 'component.tsx',
    js: 'script.js', jsx: 'component.jsx',
    py: 'main.py', sh: 'script.sh',
    css: 'styles.css', html: 'index.html',
    json: 'data.json', sql: 'query.sql',
    rs: 'main.rs', go: 'main.go',
    md: 'README.md', yml: 'config.yml',
    dockerfile: 'Dockerfile'
  }
  return defaults[ext] ?? (index > 1 ? `file-${index}.${ext}` : `file.${ext}`)
}

// ── Human-readable size ────────────────────────────────────────────────
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// ── Main extractor ────────────────────────────────────────────────────
export function extractFiles(text: string): ExtractedFile[] {
  const regex = /```(\w+)?\n?([\s\S]*?)```/g
  const files: ExtractedFile[] = []
  const seen = new Set<string>()   // deduplicate by filename
  let m: RegExpExecArray | null
  let i = 0

  while ((m = regex.exec(text)) !== null) {
    const lang = (m[1] ?? 'txt').toLowerCase()
    const code = m[2].trim()
    if (!code || code.length < 10) continue   // skip trivial snippets

    i++
    let filename = guessFilename(code, lang, i)

    // Deduplicate: if same filename appears twice, suffix with index
    if (seen.has(filename)) {
      const dot = filename.lastIndexOf('.')
      filename = dot >= 0
        ? `${filename.slice(0, dot)}-${i}${filename.slice(dot)}`
        : `${filename}-${i}`
    }
    seen.add(filename)

    const bytes = new TextEncoder().encode(code).length
    files.push({
      lang, code, filename,
      lines: code.split('\n').length,
      size:  formatSize(bytes)
    })
  }

  return files
}

// ── Client-side download ───────────────────────────────────────────────
export function downloadFile(file: ExtractedFile): void {
  const blob = new Blob([file.code], { type: 'text/plain;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = file.filename; a.click()
  URL.revokeObjectURL(url)
}

// ── ZIP download (multiple files) ─────────────────────────────────────
// Simple ZIP without dependencies: stores files uncompressed (store method)
export async function downloadZip(files: ExtractedFile[], zipName = 'ai-output.zip'): Promise<void> {
  // Build a minimal ZIP in-browser
  const encoder = new TextEncoder()

  const localHeaders: Uint8Array[] = []
  const centralDir:   Uint8Array[] = []
  let   offset = 0

  for (const file of files) {
    const name    = encoder.encode(file.filename)
    const content = encoder.encode(file.code)
    const crc32   = computeCRC32(content)
    const now     = dosDateTime()

    // Local file header (30 + name)
    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)   // signature
    lv.setUint16(4, 20, true)            // version needed
    lv.setUint16(6, 0, true)             // flags
    lv.setUint16(8, 0, true)             // compression: store
    lv.setUint16(10, now.time, true)
    lv.setUint16(12, now.date, true)
    lv.setUint32(14, crc32, true)
    lv.setUint32(18, content.length, true)
    lv.setUint32(22, content.length, true)
    lv.setUint16(26, name.length, true)
    lv.setUint16(28, 0, true)
    local.set(name, 30)

    localHeaders.push(local)
    localHeaders.push(content)

    // Central directory entry
    const cd = new Uint8Array(46 + name.length)
    const cv = new DataView(cd.buffer)
    cv.setUint32(0,  0x02014b50, true)  // signature
    cv.setUint16(4,  20, true)           // version made
    cv.setUint16(6,  20, true)           // version needed
    cv.setUint16(8,  0, true)            // flags
    cv.setUint16(10, 0, true)            // compression
    cv.setUint16(12, now.time, true)
    cv.setUint16(14, now.date, true)
    cv.setUint32(16, crc32, true)
    cv.setUint32(20, content.length, true)
    cv.setUint32(24, content.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint16(30, 0, true); cv.setUint16(32, 0, true)
    cv.setUint16(34, 0, true); cv.setUint16(36, 0, true); cv.setUint32(38, 0, true)
    cv.setUint32(42, offset, true)
    cd.set(name, 46)
    centralDir.push(cd)

    offset += 30 + name.length + content.length
  }

  const cdSize   = centralDir.reduce((s, b) => s + b.length, 0)
  const eocd     = new Uint8Array(22)
  const ev       = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(4, 0, true); ev.setUint16(6, 0, true)
  ev.setUint16(8,  files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, cdSize, true)
  ev.setUint32(16, offset, true)
  ev.setUint16(20, 0, true)

  const all  = [...localHeaders, ...centralDir, eocd]
  const total = all.reduce((s, b) => s + b.length, 0)
  const zip   = new Uint8Array(total)
  let pos = 0
  for (const b of all) { zip.set(b, pos); pos += b.length }

  const blob = new Blob([zip], { type: 'application/zip' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = zipName; a.click()
  URL.revokeObjectURL(url)
}

// ── CRC-32 ─────────────────────────────────────────────────────────────
function computeCRC32(data: Uint8Array): number {
  const table = makeCRCTable()
  let crc = 0xFFFFFFFF
  for (const b of data) crc = (crc >>> 8) ^ table[(crc ^ b) & 0xFF]
  return (crc ^ 0xFFFFFFFF) >>> 0
}
function makeCRCTable(): Uint32Array {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    t[i] = c
  }
  return t
}
function dosDateTime() {
  const d = new Date()
  return {
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
  }
}
