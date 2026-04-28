'use client'

import { useState, useRef, useEffect, useCallback, useDeferredValue } from 'react'
import Link from 'next/link'

// ── Types ────────────────────────────────────────────────────────────────
type RoleId = 'dashka' | 'claude' | 'consultant'

interface AttachedFile {
  fid:     string   // unique file id for deletion
  name:    string
  content: string   // text content or base64 data URL for images
  size:    number
  isImage?: boolean
}

interface ChatMsg {
  id:       string
  role:     'user' | 'ai'
  content:  string
  files:    AttachedFile[]
  ts:       Date
  version?: number   // document version tag (for Claude messages)
  edited?:  boolean  // was this message edited/resent
  parentId?:string  // id of original message this replaces
}

interface ColState {
  messages:  ChatMsg[]
  input:     string
  loading:   boolean
  staged:    AttachedFile[]  // staged files (already read as AttachedFile)
  dragOver:  boolean
  abortCtrl: AbortController | null
}

interface SavedFile {
  id:      string
  name:    string
  content: string
  savedAt: string
  role:    RoleId | string
  version?: number
}

// ── Role config ──────────────────────────────────────────────────────────
const ROLES: Record<RoleId, { label: string; color: string; system: string }> = {
  dashka: {
    label: 'Dashka Senior', color: '#10a37f',
    system: `You are Dashka, a super-senior Lithuanian legal advisor specializing in commercial disputes.
You help the user understand their case, clarify facts, and prepare thorough briefs for Claude Engineer.
Respond in the same language the user writes in (Russian, English, or Lithuanian).
When the user says "prepare brief" or "готовь ТЗ" — produce a structured brief:

---BRIEF FOR CLAUDE ENGINEER---
CASE: ...
PARTIES: full plaintiff / defendant details
FACTS: step-by-step narrative
LEGAL GROUNDS: Lithuanian Civil Code articles
EVIDENCE: available documents list
STRATEGY: recommended approach
MISSING DATA: what is still needed
TASK: specific instruction for drafting
---END BRIEF---`
  },
  claude: {
    label: 'Claude Engineer', color: '#7c6af7',
    system: `You are Claude Engineer, a senior Lithuanian legal document drafter.
You receive briefs and source documents, then produce complete Lithuanian court documents.
RULES:
- Extract ALL real data from attached documents (names, codes, amounts, dates, case numbers)
- NEVER use placeholders like [BŪTINA NURODYTI] or [Ieškovo vardas]
- If critical data is missing, list what is needed and STOP
- Produce the COMPLETE document — never truncate
After the document, add:
---ENGINEER NOTES---
[RISKS] ...
[QUESTIONS] ...`
  },
  consultant: {
    label: 'Consultant Advocate', color: '#c84b31',
    system: `You are an independent Lithuanian Consultant Advocate reviewing drafted court documents.
Identify: formal defects (CPK), weak arguments, missing evidence, terminology issues, strategic risks.
Format as numbered items tagged [minor], [major], or [critical]. Reference exact document sections.`
  }
}

const ROLE_IDS: RoleId[] = ['dashka', 'claude', 'consultant']

// ── Utilities ────────────────────────────────────────────────────────────
function uid()    { return Math.random().toString(36).slice(2) }
function fmt(d: Date) { return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }

const MAX_FILE_BYTES  = 2_000_000  // 2 MB per file
const MAX_IMAGE_BYTES = 1_000_000  // 1 MB per image (base64 safe)
const MAX_FILES_TOTAL = 10         // ChatGPT-style limit

async function readFile(f: File, currentCount = 0): Promise<AttachedFile | null> {
  const fid     = Math.random().toString(36).slice(2)
  const isImage = f.type.startsWith('image/')

  // Limit checks
  if (currentCount >= MAX_FILES_TOTAL) {
    alert(`Max ${MAX_FILES_TOTAL} files total. Remove some before adding more.`)
    return null
  }
  if (isImage && f.size > MAX_IMAGE_BYTES) {
    alert(`Image "${f.name}" is too large (${(f.size/1024/1024).toFixed(1)} MB). Max 1 MB for images.`)
    return null
  }
  if (!isImage && f.size > MAX_FILE_BYTES) {
    return { fid, name: f.name, content: `[File too large: ${(f.size/1024).toFixed(0)} KB. Max 2 MB. Convert to .txt.]`, size: f.size, isImage: false }
  }

  return new Promise((res, rej) => {
    const r = new FileReader()
    if (isImage) {
      r.onload  = () => res({ fid, name: f.name, content: r.result as string, size: f.size, isImage: true })
      r.onerror = rej
      r.readAsDataURL(f)
    } else {
      r.onload  = () => res({ fid, name: f.name, content: r.result as string, size: f.size, isImage: false })
      r.onerror = rej
      r.readAsText(f, 'utf-8')
    }
  })
}

// Helper: add files respecting the 10-file limit
async function readFiles(rawFiles: File[], existing: AttachedFile[]): Promise<AttachedFile[]> {
  const results: AttachedFile[] = [...existing]
  for (const f of rawFiles) {
    const af = await readFile(f, results.length)
    if (af) results.push(af)
    if (results.length >= MAX_FILES_TOTAL) break
  }
  return results
}

function lsGetFiles(): SavedFile[] {
  try { return JSON.parse(localStorage.getItem('sl_saved_files') ?? '[]') } catch { return [] }
}

function lsSaveFile(f: SavedFile) {
  try {
    const all = lsGetFiles()
    // Size guard: keep total under ~4MB
    const total = all.reduce((s, x) => s + x.content.length, 0)
    const kept  = total > 3_500_000
      ? all.sort((a, b) => a.savedAt < b.savedAt ? -1 : 1).slice(all.length > 10 ? 5 : 0)
      : all
    kept.unshift(f)
    localStorage.setItem('sl_saved_files', JSON.stringify(kept.slice(0, 60)))
  } catch {}
}

function saveAndDownload(content: string, name: string, role: RoleId | string, version?: number) {
  // Download
  const blob = new Blob([content], { type: 'text/plain' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = name; a.click()
  URL.revokeObjectURL(url)
  // Persist
  lsSaveFile({ id: uid(), name, content, savedAt: new Date().toISOString(), role, version })
}

// ── Shared streaming fetch ────────────────────────────────────────────
async function streamClaude(
  messages:   Array<{role:string; content:string}>,
  system:     string,
  signal:     AbortSignal,
  onChunk:    (accumulated: string, done: boolean) => void,
): Promise<string> {
  const res = await fetch('/api/claude', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ messages, system, stream: true }),
    signal
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error ?? `API ${res.status}`)
  }
  const reader  = res.body!.getReader()
  const decoder = new TextDecoder()
  let full      = ''
  let lastRender = 0  // throttle: render max every 30ms

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      full += decoder.decode(value, { stream: true })

      // Throttle setState — max 33fps, feels smooth without lag
      const now = Date.now()
      if (now - lastRender >= 30) {
        onChunk(full, false)
        lastRender = now
      }
    }
    // Flush: decode any remaining bytes in the codec
    full += decoder.decode()
  } finally {
    reader.cancel()
  }

  // Final render — always fires, removes cursor
  onChunk(full, true)
  return full
}

function exportCaseBundle(cols: Record<RoleId, ColState>) {
  const exportedAt = new Date()
  const ts         = exportedAt.toISOString().slice(0,10)

  // ── TXT bundle ──────────────────────────────────────────────────────
  const sections: string[] = ['# Solar Legal Style — Case Export', `Exported: ${exportedAt.toLocaleString()}`, '']
  for (const r of ROLE_IDS) {
    const role = ROLES[r]
    const aiMsgs = cols[r].messages.filter(m => m.role === 'ai')
    if (aiMsgs.length === 0) continue
    sections.push(`${'='.repeat(60)}`)
    sections.push(`ROLE: ${role.label.toUpperCase()}`)
    sections.push(`${'='.repeat(60)}`)
    aiMsgs.forEach((m, i) => {
      sections.push(`\n--- Message ${i+1}${m.version ? ` (v${m.version})` : ''} [${fmt(m.ts)}] ---`)
      sections.push(m.content)
      m.files.forEach(f => { sections.push(`\n[FILE: ${f.name}]\n${f.content}`) })
    })
    sections.push('')
  }
  saveAndDownload(sections.join('\n'), `case_export_${ts}.txt`, 'system')

  // ── JSON snapshot ────────────────────────────────────────────────────
  const snapshot = {
    exportedAt: exportedAt.toISOString(),
    roles: ROLE_IDS.reduce((acc, r) => {
      acc[r] = cols[r].messages.map(m => ({
        id: m.id, role: m.role,
        content: m.content,
        files: m.files.map(f => ({ name: f.name, size: f.size })), // no content in JSON — too heavy
        ts: m.ts.toISOString(),
        version: m.version
      }))
      return acc
    }, {} as Record<string, unknown[]>)
  }
  const jsonBlob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
  const jsonUrl  = URL.createObjectURL(jsonBlob)
  const a2       = document.createElement('a')
  a2.href = jsonUrl; a2.download = `case_export_${ts}.json`; a2.click()
  URL.revokeObjectURL(jsonUrl)
}

// ── TTS hook ─────────────────────────────────────────────────────────────
function useTTS() {
  const [speaking, setSpeaking] = useState<string | null>(null)
  const speak = (id: string, text: string) => {
    speechSynthesis.cancel()
    if (speaking === id) { setSpeaking(null); return }
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'ru-RU'; u.rate = 1
    u.onend = () => setSpeaking(null)
    u.onerror = () => setSpeaking(null)
    speechSynthesis.speak(u)
    setSpeaking(id)
  }
  const stop = () => { speechSynthesis.cancel(); setSpeaking(null) }
  return { speaking, speak, stop }
}

// ── STT hook ─────────────────────────────────────────────────────────────
function useSTT(onLiveUpdate: (text: string, isInterim: boolean) => void, onFinal: (text: string) => void) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef      = useRef<any>(null)
  const finalBuf    = useRef('')    // locked confirmed text — never overwritten
  const baseText    = useRef('')    // text in field before recording started
  const manualStop  = useRef(false)
  const safetyRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [active,    setActive]    = useState(false)
  const [interim,   setInterim]   = useState('')   // live in-progress segment
  const [isSpeaking,setIsSpeaking]= useState(false) // voice activity detector
  const silenceRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  const doStop = useCallback((commit: boolean) => {
    manualStop.current = true
    if (safetyRef.current) { clearTimeout(safetyRef.current); safetyRef.current = null }
    try { recRef.current?.stop() } catch {}
    recRef.current = null
    setInterim('')
    setIsSpeaking(false)
    if (silenceRef.current) clearTimeout(silenceRef.current)
    setActive(false)
    if (commit) {
      const full = (baseText.current + finalBuf.current).trimEnd()
      finalBuf.current = ''
      baseText.current = ''
      if (full) onFinal(full)
    } else {
      finalBuf.current = ''
      baseText.current = ''
    }
  }, [onFinal])

  const startRec = useCallback((SR: any, currentInput: string) => {
    manualStop.current = false
    baseText.current  = currentInput ? currentInput.replace(/▍$/, '').trimEnd() + ' ' : ''
    finalBuf.current  = ''

    const rec = new SR() as any
    rec.lang           = 'ru-RU'
    rec.continuous     = true
    rec.interimResults = true

    rec.onresult = (e: any) => {
      let interimText = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) {
          finalBuf.current += t + ' '   // ← lock finals, never touch again
        } else {
          interimText = t               // ← current in-progress only
        }
      }
      setInterim(interimText)

      // Voice activity: mark as speaking, reset silence timer
      setIsSpeaking(true)
      if (silenceRef.current) clearTimeout(silenceRef.current)
      silenceRef.current = setTimeout(() => setIsSpeaking(false), 1200) // 1.2s pause = silent

      // Two-part live update: confirmed (normal) + interim (greyed)
      const confirmedPart = baseText.current + finalBuf.current
      onLiveUpdate(confirmedPart, false)
      if (interimText) onLiveUpdate(confirmedPart + interimText + '▍', true)
    }

    rec.onerror = (e: any) => {
      if (e.error === 'no-speech') return
      doStop(true)
    }

    // FIX: Chrome auto-stops after ~60s — restart if still active
    rec.onend = () => {
      if (!manualStop.current && recRef.current !== null) {
        try { rec.start() } catch { doStop(true) }  // ← auto-restart
      }
    }

    rec.start()
    recRef.current = rec
    safetyRef.current = setTimeout(() => doStop(true), 180_000)
  }, [onLiveUpdate, doStop])

  const toggle = useCallback((currentInput = '') => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { alert('Speech recognition requires Chrome.'); return }
    if (active) { doStop(true); return }
    setActive(true)
    startRec(SR, currentInput)
  }, [active, doStop, startRec])

  const clear = useCallback(() => {
    finalBuf.current = ''
    baseText.current = ''
    setInterim('')
    onLiveUpdate('', false)
  }, [onLiveUpdate])

  return { active, interim, isSpeaking, toggle, clear }
}

// ── Bubble component ──────────────────────────────────────────────────────
function Bubble({ msg, color, tts, role, versionCount, onTagVersion, onEdit, onDeleteFile, isLoading }: {
  msg:          ChatMsg
  color:        string
  tts:          ReturnType<typeof useTTS>
  role:         RoleId
  versionCount: number
  onTagVersion: (msgId: string) => void
  onEdit:       (msg: ChatMsg, newText: string, newFiles: AttachedFile[]) => void
  onDeleteFile: (msgId: string, fid: string) => void
  isLoading?:   boolean
}) {
  const [copied,    setCopied]    = useState(false)
  const [editing,   setEditing]   = useState(false)
  const [editText,  setEditText]  = useState(msg.content)
  const [editFiles, setEditFiles] = useState<AttachedFile[]>(msg.files)
  const [lightbox,  setLightbox]  = useState<string | null>(null)  // fullscreen image
  const editFileRef = useRef<HTMLInputElement>(null)
  const isUser    = msg.role === 'user'
  const isSpeaking = tts.speaking === msg.id

  const copy = () => {
    navigator.clipboard.writeText(msg.content)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  const save = () => {
    const ts   = msg.ts.toISOString().slice(0,16).replace('T','_').replace(/:/g,'-')
    const slug = msg.content.slice(0,25).toLowerCase().replace(/[^a-z0-9а-яёa-z]/gi,'_').replace(/_+/g,'_')
    const full = [msg.content, ...msg.files.map(f => `\n---\n[FILE: ${f.name}]\n${f.content}`)].join('\n')
    const ver  = msg.version ? `_v${msg.version}` : ''
    saveAndDownload(full, `${role}_${ts}${ver}_${slug}.txt`, role, msg.version)
  }

  const speak = () => {
    const full = [msg.content, ...msg.files.map(f => f.content || '')].join('\n')
    tts.speak(msg.id, full)
  }

  // Open edit — initialise with current state
  const openEdit = () => {
    setEditText(msg.content)
    setEditFiles([...msg.files])
    setEditing(true)
  }

  const cancelEdit = () => setEditing(false)

  const resend = () => {
    onEdit(msg, editText, editFiles)
    setEditing(false)
  }

  const addEditFile = async (fl: FileList | null) => {
    if (!fl) return
    for (const f of Array.from(fl)) {
      const af = await readFile(f, editFiles.length)
      if (af) setEditFiles(prev => [...prev, af])
    }
  }

  // ── EDIT MODE (multimodal: STT + paste image + drag & drop) ─────────────
  if (editing && isUser) {
    const [editDragOver, setEditDragOver] = [false, () => {}] // drag state via ref
    
    // Handle paste (⌘V) — text goes to textarea, images become file attachments
    const handleEditPaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = Array.from(e.clipboardData.items)
      const imageItem = items.find(i => i.type.startsWith('image/'))
      if (imageItem) {
        e.preventDefault()
        const file = imageItem.getAsFile()
        if (!file) return
        try {
          const af = await readFile(file, editFiles.length)
          if (af) setEditFiles(prev => [...prev, af])
        } catch {}
      }
      // text paste flows through normally
    }

    // Handle drop into edit area
    const handleEditDrop = async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      const dropped = Array.from(e.dataTransfer.files)
      let cnt = editFiles.length
      for (const f of dropped) {
        try {
          const af = await readFile(f, cnt)
          if (af) { setEditFiles(prev => [...prev, af]); cnt++ }
        } catch {}
      }
    }

    // STT for edit textarea
    const editStt = {
      active: false,
      toggle: () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        if (!SR) { alert('Speech recognition requires Chrome.'); return }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rec = new SR() as any
        rec.lang = 'ru-RU'; rec.continuous = false; rec.interimResults = false
        rec.onresult = (e: any) => {
          const t = e.results[0][0].transcript
          setEditText(prev => (prev.trimEnd() + (prev ? ' ' : '') + t))
        }
        rec.start()
      }
    }

    return (
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={handleEditDrop}
        style={{
          display:'flex', flexDirection:'column', gap:8,
          padding:'12px 14px', borderRadius:12,
          background:'rgba(255,255,255,.05)',
          border:`2px solid ${color}55`,
        }}>

        {/* Edit textarea with paste + STT */}
        <div style={{ position:'relative' }}>
          <textarea
            value={editText}
            onChange={e => setEditText(e.target.value)}
            onPaste={handleEditPaste}
            rows={4}
            autoFocus
            placeholder="Edit message… paste image with ⌘V, drag & drop files"
            style={{
              width:'100%', background:'rgba(255,255,255,.06)',
              border:`1px solid ${color}44`, borderRadius:8,
              padding:'8px 40px 8px 10px', fontSize:13, lineHeight:1.6,
              color:'#e4e2dd', resize:'vertical', fontFamily:'inherit',
              outline:'none', minHeight:80, boxSizing:'border-box'
            }}
          />
          {/* STT button inside textarea */}
          <button onClick={editStt.toggle} title="Voice input"
            style={{
              position:'absolute', right:8, bottom:8,
              background:'none', border:'none', cursor:'pointer',
              color:'rgba(255,255,255,.35)', padding:4,
              borderRadius:6, transition:'color .15s',
            }}
            onMouseOver={e => (e.currentTarget.style.color = color)}
            onMouseOut={e => (e.currentTarget.style.color = 'rgba(255,255,255,.35)')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          </button>
        </div>

        {/* Drag & drop hint */}
        <div style={{ fontSize:10, color:'rgba(255,255,255,.2)', textAlign:'center' }}>
          📎 attach · 🎤 voice · ⌘V paste image · drag & drop files
        </div>

        {/* Attached files in edit — each with × */}
        {editFiles.length > 0 && (
          <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
            {editFiles.map(f => (
              <div key={f.fid} style={{
                display:'flex', alignItems:'center', gap:4,
                padding:'2px 8px', borderRadius:8, fontSize:11,
                background: f.name.match(/\.(png|jpg|jpeg|gif|webp)$/i) ? `${color}22` : 'rgba(255,255,255,.07)',
                border:`1px solid ${f.name.match(/\.(png|jpg|jpeg|gif|webp)$/i) ? color+'44' : 'rgba(255,255,255,.1)'}`,
                color:'rgba(255,255,255,.7)'
              }}>
                {f.name.match(/\.(png|jpg|jpeg|gif|webp)$/i) ? '🖼' : '📎'} {f.name}
                <span style={{ fontSize:10, color:'rgba(255,255,255,.3)', marginLeft:2 }}>
                  {f.content.length > 100 ? `${(f.size/1024).toFixed(0)}KB` : ''}
                </span>
                <button
                  onClick={() => setEditFiles(prev => prev.filter(x => x.fid !== f.fid))}
                  style={{ background:'none', border:'none', cursor:'pointer',
                    color:'rgba(239,68,68,.7)', padding:0, fontSize:14, lineHeight:1 }}>×</button>
              </div>
            ))}
          </div>
        )}

        {/* Action row */}
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          {/* Attach file */}
          <input ref={editFileRef} type="file" multiple style={{ display:'none' }}
            onChange={async e => {
              for (const f of Array.from(e.target.files ?? [])) {
                try {
                  const af = await readFile(f, editFiles.length)
                  if (af) setEditFiles(prev => [...prev, af])
                } catch {}
              }
              e.target.value = ''
            }} />
          <button onClick={() => editFileRef.current?.click()} style={{
            background:'none', border:`1px solid ${color}44`, borderRadius:7,
            cursor:'pointer', fontSize:11, padding:'4px 10px', color:color
          }}>📎 Add file</button>

          <div style={{ flex:1 }}/>

          <button onClick={cancelEdit} style={{
            background:'none', border:'1px solid rgba(255,255,255,.15)', borderRadius:7,
            cursor:'pointer', fontSize:12, padding:'5px 12px', color:'rgba(255,255,255,.45)'
          }}>Cancel</button>
          <button onClick={resend} disabled={!editText.trim() && editFiles.length === 0} style={{
            background:color, border:'none', borderRadius:7,
            cursor:'pointer', fontSize:12, padding:'5px 14px',
            color:'#fff', fontWeight:600,
            opacity: (editText.trim() || editFiles.length > 0) ? 1 : 0.4
          }}>↺ Resend</button>
        </div>
      </div>
    )
  }

  // ── NORMAL VIEW ───────────────────────────────────────────────────────
  return (
    <div style={{ display:'flex', flexDirection:'column',
      alignItems: isUser ? 'flex-end' : 'flex-start', gap: 3 }}>
    {/* Image lightbox — fixed overlay, renders above everything */}
    {lightbox && (
      <div onClick={() => setLightbox(null)}
        style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,.88)',
          display:'flex', alignItems:'center', justifyContent:'center', cursor:'zoom-out' }}>
        <img src={lightbox} alt="preview"
          style={{ maxWidth:'92vw', maxHeight:'92vh', objectFit:'contain',
            borderRadius:12, boxShadow:'0 8px 40px rgba(0,0,0,.7)' }} />
        <button onClick={e => { e.stopPropagation(); setLightbox(null) }}
          style={{ position:'absolute', top:20, right:24, background:'rgba(255,255,255,.15)',
            border:'none', cursor:'pointer', color:'#fff', borderRadius:'50%',
            width:36, height:36, fontSize:20, lineHeight:'36px' }}>×</button>
      </div>
    )}

      {/* Version badge */}
      {msg.version && (
        <div style={{ fontSize:9, fontWeight:700, letterSpacing:'.06em', color,
          padding:'1px 7px', borderRadius:10, border:`1px solid ${color}55`,
          alignSelf: isUser ? 'flex-end' : 'flex-start' }}>
          v{msg.version}
        </div>
      )}

      {/* Edited badge */}
      {msg.edited && isUser && (
        <div style={{ fontSize:9, color:'rgba(255,255,255,.3)',
          alignSelf:'flex-end', marginBottom:1 }}>✏️ edited</div>
      )}

      {/* File chips + inline image preview */}
      {msg.files.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:6,
          alignItems: isUser ? 'flex-end' : 'flex-start', maxWidth:'91%' }}>
          {msg.files.map(f => (
            <div key={f.fid}>
              {f.isImage && f.content.startsWith('data:') ? (
                /* Inline image preview */
                <div style={{ position:'relative', display:'inline-block' }}>
                  <img src={f.content} alt={f.name}
                    onClick={() => setLightbox(f.content)}
                    style={{ maxWidth:280, maxHeight:200, borderRadius:10,
                      border:`1px solid ${color}33`, display:'block',
                      objectFit:'contain', background:'rgba(0,0,0,.2)',
                      cursor:'zoom-in', transition:'opacity .15s' }}
                    onMouseOver={e => (e.currentTarget.style.opacity='.85')}
                    onMouseOut={e => (e.currentTarget.style.opacity='1')} />
                  {isUser && (
                    <button onClick={() => onDeleteFile(msg.id, f.fid)}
                      title="Remove image" style={{
                        position:'absolute', top:4, right:4,
                        background:'rgba(0,0,0,.7)', border:'none', cursor:'pointer',
                        color:'#fff', borderRadius:'50%', width:18, height:18,
                        fontSize:11, lineHeight:'18px', textAlign:'center' }}>×</button>
                  )}
                  <div style={{ fontSize:9, color:'rgba(255,255,255,.3)', marginTop:2, textAlign:'center' }}>
                    🖼 {f.name}
                  </div>
                </div>
              ) : (
                /* Text file chip */
                <span style={{ display:'flex', alignItems:'center', gap:4,
                  fontSize:10, padding:'2px 7px', borderRadius:10,
                  background:'rgba(255,255,255,.06)', color:'rgba(255,255,255,.5)',
                  border:'1px solid rgba(255,255,255,.08)' }}>
                  📎 {f.name}
                  {isUser && (
                    <button onClick={() => onDeleteFile(msg.id, f.fid)}
                      title="Remove this file from context"
                      style={{ background:'none', border:'none', cursor:'pointer',
                        color:'rgba(239,68,68,.5)', padding:0, fontSize:12,
                        lineHeight:1, marginLeft:1 }}>×</button>
                  )}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Bubble */}
      <div style={{
        maxWidth:'91%', padding:'9px 13px',
        borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
        background: isUser ? 'rgba(255,255,255,.07)' : `${color}16`,
        border:`1px solid ${isUser ? 'rgba(255,255,255,.07)' : color+'2e'}`,
        borderLeft: !isUser ? `3px solid ${color}` : undefined,
        fontSize:13, lineHeight:1.65, color:'#e4e2dd',
        whiteSpace:'pre-wrap', wordBreak:'break-word'
      }}>
        {msg.content}
      </div>

      {/* Actions */}
      <div style={{ display:'flex', gap:3, alignItems:'center',
        paddingLeft: isUser ? 0 : 6, paddingRight: isUser ? 6 : 0 }}>
        <span style={{ fontSize:10, color:'rgba(255,255,255,.2)', marginRight:4 }}>{fmt(msg.ts)}</span>
        {isUser && (<>
          <Btn label={copied ? '✓' : '📋'} on={copied} onClick={() => {
            navigator.clipboard.writeText(msg.content)
            setCopied(true); setTimeout(() => setCopied(false), 1500)
          }} title="Copy message text" />
          <Btn label="↺" onClick={() => {
            if (isLoading) return
            const safeFiles = (msg.files ?? []).filter(f => f?.content !== undefined)
            onEdit(msg, msg.content, safeFiles)
          }} title={isLoading ? 'Wait for response to finish' : 'Re-send — same message + files'}
            clr={isLoading ? 'rgba(255,255,255,.2)' : undefined} />
          <Btn label="✏️" onClick={() => { if (!isLoading) openEdit() }}
            title={isLoading ? 'Wait for response to finish' : 'Edit message and resend'}
            clr={isLoading ? 'rgba(255,255,255,.2)' : undefined} />
        </>)}
        {!isUser && (<>
          <Btn label={copied ? '✓' : '📋'} onClick={copy} on={copied} />
          <Btn label="💾" onClick={save} />
          <Btn label={isSpeaking ? '⏹' : '🔊'} onClick={speak} on={isSpeaking}
            clr={isSpeaking ? '#f59e0b' : undefined} />
          {role === 'claude' && (
            <Btn label={`📌 v${versionCount + 1}`} onClick={() => onTagVersion(msg.id)}
              title="Tag as new document version" />
          )}
        </>)}
      </div>
    </div>
  )
}


function Btn({ label, onClick, on, clr, title }: {
  label: string; onClick: () => void; on?: boolean; clr?: string; title?: string
}) {
  return (
    <button onClick={onClick} title={title} style={{
      background: on ? 'rgba(255,255,255,.1)' : 'none',
      border: '1px solid rgba(255,255,255,.08)', borderRadius: 6,
      cursor: 'pointer', fontSize: 11, padding: '2px 7px',
      color: clr ?? (on ? '#fff' : 'rgba(255,255,255,.38)'), transition: 'all .15s'
    }}>{label}</button>
  )
}

// ── Icon button ───────────────────────────────────────────────────────────
function Ico({ onClick, title, hoverColor, active, children }: {
  onClick: () => void; title: string; hoverColor: string; active?: boolean; children: React.ReactNode
}) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick} title={title}
      onMouseOver={() => setHov(true)} onMouseOut={() => setHov(false)}
      style={{ background: active ? `${hoverColor}22` : 'none', border:'none', cursor:'pointer',
        color: (active || hov) ? hoverColor : 'rgba(255,255,255,.3)',
        padding:'4px', borderRadius:7, flexShrink:0, display:'flex', alignItems:'center',
        justifyContent:'center', transition:'color .15s, background .15s',
        alignSelf:'flex-end', marginBottom:1 }}>
      {children}
    </button>
  )
}

// ── Chat column ───────────────────────────────────────────────────────────
function ChatCol({ roleId, state, onChange, savedFiles, onDropFromPanel }: {
  roleId:         RoleId
  state:          ColState
  onChange:       (p: Partial<ColState> | ((prev: ColState) => Partial<ColState>)) => void
  savedFiles:     SavedFile[]
  onDropFromPanel:(f: SavedFile) => void
}) {
  const role      = ROLES[roleId]
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileRef   = useRef<HTMLInputElement>(null)
  const taRef     = useRef<HTMLTextAreaElement>(null)
  const tts       = useTTS()
  const [showDown,      setShowDown]      = useState(false)
  const [showDiff,      setShowDiff]      = useState(false)
  const [inspectorData, setInspectorData] = useState<InspectorData | null>(null)
  const reqIdRef = useRef(0)   // race condition guard

  // Version counter for Claude messages
  const versionCount = state.messages.filter(m => m.role === 'ai' && m.version).length
  const versionedMsgs = state.messages.filter(m => m.role === 'ai' && m.version)
    .sort((a, b) => (a.version ?? 0) - (b.version ?? 0))
    .map(m => ({ version: m.version ?? 1, content: m.content, ts: m.ts }))

  // ── Edit + resend ──────────────────────────────────────────────────────
  const handleEdit = async (original: ChatMsg, newText: string, newFiles: AttachedFile[]) => {
    // Build new message (immutable — don't mutate original)
    const editedMsg: ChatMsg = {
      id:       uid(),
      role:     'user',
      content:  newText,
      files:    newFiles,
      ts:       new Date(),
      edited:   true,
      parentId: original.id
    }

    // Replace original in history + remove everything after it (stale AI replies)
    const idx      = state.messages.findIndex(m => m.id === original.id)
    const newHist  = idx >= 0
      ? [...state.messages.slice(0, idx), editedMsg]
      : [...state.messages, editedMsg]

    // Build file context from new files
    const fileCtx = newFiles.filter(f => f?.content).map(f => f.isImage ? `\n\n[IMAGE ATTACHED: ${f.name} — ${(f.size/1024).toFixed(0)}KB screenshot]` : `\n\n[FILE: ${f.name}]\n${(f.content||'').slice(0, 8000)}`).join('')

    const myReqId = ++reqIdRef.current
    const ctrl = new AbortController()
    onChange({ messages: newHist, loading: true, abortCtrl: ctrl })

    try {
      const apiMsgs = newHist.map(m => ({
        role:    m.role === 'ai' ? 'assistant' : 'user',
        content: (m === editedMsg && fileCtx)
          ? (newText ? newText + fileCtx : 'Please review:' + fileCtx)
          : m.content
      }))
      const aiId  = uid()
      const aiMsg: ChatMsg = { id: aiId, role: 'ai', content: '', files: [], ts: new Date() }
      onChange({ messages: [...newHist, aiMsg], loading: true, abortCtrl: ctrl })

      let accumulated = ''
      const reply = await streamClaude(apiMsgs, ROLES[roleId].system, ctrl.signal,
        (text, done) => {
          if (reqIdRef.current !== myReqId) return
          accumulated = text
          onChange(prev => ({
            messages: (prev.messages ?? []).map(m =>
              m.id === aiId ? { ...m, content: done ? text : text + '▍' } : m
            ),
            ...(done ? { loading: false, abortCtrl: null } : {})
          }))
        }
      )
      if (reqIdRef.current !== myReqId) return
      onChange(prev => ({
        messages: (prev.messages ?? []).map(m =>
          m.id === aiId ? { ...m, content: reply } : m
        ),
        loading: false, abortCtrl: null
      }))
    } catch (e) {
      if (reqIdRef.current !== myReqId) return
      const aborted = (e as Error).name === 'AbortError'
      if (!aborted) {
        const errMsg: ChatMsg = { id: uid(), role: 'ai', content: `⚠️ ${(e as Error).message}`, files: [], ts: new Date() }
        onChange({ messages: [...newHist, errMsg], loading: false, abortCtrl: null })
      } else {
        // Aborted — mark partial message as stopped
        onChange(prev => ({
          messages: (prev.messages ?? []).map((m, i, arr) =>
            i === arr.length - 1 && m.role === 'ai' && !m.content.includes('⚠️ stopped')
              ? { ...m, content: m.content.replace(/▍$/g, '').trimEnd() + (m.content.replace(/▍$/g,'').trim() ? ' ⚠️ stopped' : '') }
              : m
          ),
          loading: false, abortCtrl: null
        }))
      }
    }
  }

  // ── Delete file — immutable (create new msg, trim stale AI tail) ────────
  const handleDeleteFile = (msgId: string, fid: string) => {
    const idx = state.messages.findIndex(m => m.id === msgId)
    if (idx < 0) return
    const orig = state.messages[idx]
    const newMsg: ChatMsg = {
      id:       uid(),
      role:     'user',
      content:  orig.content,
      files:    orig.files.filter(f => f.fid !== fid),
      ts:       new Date(),
      edited:   true,
      parentId: orig.id
    }
    // Replace original + remove stale AI replies after it
    onChange({ messages: [...state.messages.slice(0, idx), newMsg] })
  }

  const tagVersion = (msgId: string) => {
    const next = versionCount + 1
    onChange({
      messages: state.messages.map(m => m.id === msgId ? { ...m, version: next } : m)
    })
  }

  // STT — live streaming into textarea, two-part: confirmed + interim
  const [sttInterimText, setSttInterimText] = useState('')  // grey overlay text
  const stt = useSTT(
    // onLiveUpdate: stable confirmed text + optional interim portion
    (text, isInterim) => {
      if (isInterim) {
        // Split: extract stable part (before ▍) vs interim suffix
        const cursorIdx = text.lastIndexOf('▍')
        if (cursorIdx > 0) {
          // The interim portion comes after finalBuf — we track it separately
          setSttInterimText(text)  // full display text stored for overlay
        }
        onChange({ input: text })
      } else {
        setSttInterimText('')
        onChange({ input: text })
      }
      if (taRef.current) {
        taRef.current.style.height = 'auto'
        taRef.current.style.height = Math.min(taRef.current.scrollHeight, 140) + 'px'
      }
    },
    // onFinal: clean up cursor, commit
    (committed) => {
      setSttInterimText('')
      const clean = committed.replace(/▍$/, '').trimEnd()
      onChange({ input: clean })
      setTimeout(() => taRef.current?.focus(), 50)
    }
  )

  // Smart auto-scroll
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    if (atBottom) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [state.messages, state.loading])

  // Scroll button visibility
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const check = () => setShowDown(el.scrollHeight - el.scrollTop - el.clientHeight > 140)
    el.addEventListener('scroll', check)
    return () => el.removeEventListener('scroll', check)
  }, [])

  const scrollDown = () => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })

  // Send message
  const send = async () => {
    const text  = state.input.trim()
    const files = state.staged
    if (!text && files.length === 0) return

    // staged is already AttachedFile[] (read at attach time) — use directly
    const attached: AttachedFile[] = files
    const fileCtx = attached.map(f => f.isImage ? `\n\n[IMAGE ATTACHED: ${f.name} — ${(f.size/1024).toFixed(0)}KB. The user has shared a screenshot/image. Acknowledge it and ask them to describe what you should analyze if relevant.]` : `\n\n[FILE: ${f.name}]\n${f.content.slice(0, 8000)}`).join('')

    const userMsg: ChatMsg = {
      id: uid(), role: 'user',
      content: text || `(attached ${files.length} file${files.length > 1 ? 's' : ''})`,
      files: attached, ts: new Date()
    }
    const history = [...state.messages, userMsg]

    // Race condition guard
    const myReqId = ++reqIdRef.current
    const ctrl = new AbortController()
    onChange({ messages: history, input: '', staged: [], loading: true, abortCtrl: ctrl })
    if (taRef.current) taRef.current.style.height = 'auto'

    try {
      const apiMsgs = history.map(m => ({
        role:    m.role === 'ai' ? 'assistant' : 'user',
        content: (m === userMsg && fileCtx)
          ? (text ? text + fileCtx : 'Please review:' + fileCtx)
          : m.content
      }))
      // Streaming: add placeholder AI message and update it as chunks arrive
      const aiId  = uid()
      const aiMsg: ChatMsg = { id: aiId, role: 'ai', content: '', files: [], ts: new Date() }
      onChange({ messages: [...history, aiMsg], loading: true, abortCtrl: ctrl })

      let accumulated = ''
      const reply = await streamClaude(apiMsgs, role.system, ctrl.signal,
        (text, done) => {
          if (reqIdRef.current !== myReqId) return
          accumulated = text
          onChange(prev => ({
            messages: (prev.messages ?? []).map(m =>
              m.id === aiId ? { ...m, content: done ? text : text + '▍' } : m
            ),
            ...(done ? { loading: false, abortCtrl: null } : {})
          }))
        }
      )
      if (reqIdRef.current !== myReqId) return
      // Guarantee final state is clean (no cursor, loading off)
      onChange(prev => ({
        messages: (prev.messages ?? []).map(m =>
          m.id === aiId ? { ...m, content: reply } : m
        ),
        loading: false, abortCtrl: null
      }))
    } catch (e) {
      if (reqIdRef.current !== myReqId) return
      const aborted = (e as Error).name === 'AbortError'
      if (!aborted) {
        onChange({ messages: [...history, { id: uid(), role: 'ai', content: `⚠️ ${(e as Error).message}`, files: [], ts: new Date() }], loading: false, abortCtrl: null })
      } else {
        onChange({ loading: false, abortCtrl: null })
      }
    }
  }

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send() }
  }
  const resize = (el: HTMLTextAreaElement) => { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 140) + 'px' }

  // Drag & drop (from file system OR from saved panel)
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    onChange({ dragOver: false })

    // Check if dropping a saved-file ID from our panel
    const savedId = e.dataTransfer.getData('sl_saved_file_id')
    if (savedId) {
      const sf = savedFiles.find(f => f.id === savedId)
      if (sf) { onDropFromPanel(sf); return }
    }

    // Regular file drop — go through readFiles for limits + image support
    const dropped = Array.from(e.dataTransfer.files)
    if (dropped.length > 0) {
      const newFiles = await readFiles(dropped, state.staged)
      onChange({ staged: newFiles })
    }
  }

  const aiCount = state.messages.filter(m => m.role === 'ai').length

  return (
    <div
      onDragOver={e => { e.preventDefault(); onChange({ dragOver: true }) }}
      onDragLeave={() => onChange({ dragOver: false })}
      onDrop={handleDrop}
      style={{
        display:'flex', flexDirection:'column', height:'100%', position:'relative',
        borderRight: '1px solid rgba(255,255,255,.06)', overflow:'hidden',
        outline: state.dragOver ? `2px dashed ${role.color}` : 'none',
        background: state.dragOver ? `${role.color}09` : 'transparent',
        transition: 'outline .15s, background .15s'
      }}>

      {/* Drop overlay */}
      {state.dragOver && (
        <div style={{ position:'absolute', inset:0, zIndex:50, display:'flex',
          alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
          <div style={{ fontSize:14, fontWeight:600, color:role.color,
            background:'rgba(0,0,0,.6)', padding:'12px 24px', borderRadius:12,
            border:`1px solid ${role.color}55` }}>
            Drop files here →  {role.label}
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ padding:'10px 14px', borderBottom:'1px solid rgba(255,255,255,.06)',
        display:'flex', alignItems:'center', gap:8, flexShrink:0, background:'#111113' }}>
        <div style={{ width:8, height:8, borderRadius:'50%', background:role.color,
          boxShadow:`0 0 8px ${role.color}88`, flexShrink:0 }}/>
        <span style={{ fontWeight:600, fontSize:13, flex:1 }}>{role.label}</span>
        {aiCount > 0 && <span style={{ fontSize:10, color:role.color, fontWeight:600 }}>{aiCount} replies</span>}
        {state.loading && (
          <button
            onClick={() => { state.abortCtrl?.abort(); onChange({ loading:false, abortCtrl:null }) }}
            title="Stop generation — you can then add more files and continue"
            style={{
              background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.35)',
              borderRadius: 6, cursor: 'pointer', fontSize: 10, padding: '2px 8px',
              color: '#ef4444', fontWeight: 600, animation: 'pulse-stop 1.5s ease-in-out infinite'
            }}>
            ⏹ Stop
          </button>
        )}
        {versionCount > 0 && (
          <span style={{ fontSize:9, padding:'1px 6px', borderRadius:8,
            border:`1px solid ${role.color}55`, color:role.color }}>
            {versionCount} version{versionCount > 1 ? 's' : ''}
          </span>
        )}
        {roleId === 'claude' && versionCount >= 2 && (
          <button onClick={() => setShowDiff(true)} style={{
            background:`${role.color}22`, border:`1px solid ${role.color}55`,
            borderRadius:6, cursor:'pointer', fontSize:10, padding:'2px 8px',
            color:role.color, fontWeight:600 }}>
            ⚖️ Diff
          </button>
        )}
        {state.messages.length > 0 && (<>
          <button onClick={() => {
            // Build context snapshot for inspector
            const lastUserMsg = [...state.messages].reverse().find(m => m.role === 'user')
            const fileCtx = lastUserMsg
              ? (lastUserMsg.files ?? []).filter(f => f?.name).map(f =>
                  f.isImage
                    ? `\n[IMAGE: ${f.name}]`
                    : `\n[FILE: ${f.name}]\n${(f.content||'').slice(0, 3000)}`
                ).join('\n')
              : ''
            const apiMsgs = state.messages.map(m => ({
              role: m.role === 'ai' ? 'assistant' : 'user',
              content: m.content
            }))
            const totalChars = role.system.length + apiMsgs.reduce((s,m) => s + m.content.length, 0) + fileCtx.length
            setInspectorData({
              roleId:    roleId,
              roleLabel: role.label,
              systemPrompt: role.system,
              messages:  apiMsgs,
              fileCtx,
              totalChars,
              estimatedTokens: Math.round(totalChars / 3.8),
            })
          }} style={{ background:'none', border:'1px solid rgba(255,255,255,.1)',
            borderRadius:5, cursor:'pointer', fontSize:10, padding:'1px 7px',
            color:'rgba(255,255,255,.35)' }}>📊</button>
          <button onClick={() => { if (confirm(`Clear ${role.label}?`)) { onChange({ messages:[] }); tts.stop() } }}
            style={{ background:'none', border:'none', cursor:'pointer',
              fontSize:11, color:'rgba(255,255,255,.22)', padding:'1px 5px' }}>Clear</button>
        </>)}
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex:1, overflowY:'auto', padding:'14px 12px',
        display:'flex', flexDirection:'column', gap:12,
        scrollbarWidth:'thin', scrollbarColor:'rgba(255,255,255,.07) transparent' }}>

        {state.messages.length === 0 && (
          <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center',
            justifyContent:'center', gap:10, color:'rgba(255,255,255,.17)',
            textAlign:'center', padding:'40px 16px' }}>
            <div style={{ fontSize:30 }}>
              {roleId==='dashka'?'🟢':roleId==='claude'?'🟣':'🔴'}
            </div>
            <div style={{ fontSize:13, fontWeight:600, color:'rgba(255,255,255,.28)' }}>{role.label}</div>
            <div style={{ fontSize:11, lineHeight:1.75, maxWidth:190, color:'rgba(255,255,255,.18)' }}>
              {roleId==='dashka' && 'Discuss the case. Say "prepare brief" when ready for ТЗ → Claude.'}
              {roleId==='claude' && 'Paste Dashka brief or attach files. Produces full Lithuanian legal document.'}
              {roleId==='consultant' && 'Paste or attach draft document for independent legal review.'}
            </div>
            <div style={{ fontSize:10, color:'rgba(255,255,255,.1)', marginTop:4 }}>
              🎤 voice  ·  📎 attach  ·  drag & drop  ·  ⌘↵ send
            </div>
          </div>
        )}

        {state.messages.map(msg => (
          <Bubble key={msg.id} msg={msg} color={role.color} tts={tts}
            role={roleId} versionCount={versionCount} onTagVersion={tagVersion}
            onEdit={handleEdit} onDeleteFile={handleDeleteFile}
            isLoading={state.loading} />
        ))}

        {state.loading && (
          <div style={{ display:'flex', gap:5, padding:'10px 14px',
            background:`${role.color}14`, border:`1px solid ${role.color}28`,
            borderRadius:'14px 14px 14px 4px', width:'fit-content' }}>
            {[0,1,2].map(i => (
              <div key={i} style={{ width:6, height:6, borderRadius:'50%', background:role.color,
                animation:'blink 1.2s ease-in-out infinite', animationDelay:`${i*.2}s` }}/>
            ))}
          </div>
        )}
      </div>

      {/* Diff Viewer modal */}
      {showDiff && roleId === 'claude' && versionedMsgs.length >= 2 && (
        <DiffViewer versions={versionedMsgs} onClose={() => setShowDiff(false)} />
      )}

      {/* Prompt Inspector */}
      {inspectorData && (
        <PromptInspector data={inspectorData} onClose={() => setInspectorData(null)} />
      )}

      {/* Scroll button */}
      {showDown && (
        <button onClick={scrollDown} style={{
          position:'absolute', right:12,
          bottom: state.staged.length > 0 ? 108 : 72,
          width:30, height:30, borderRadius:'50%',
          background:'rgba(25,25,30,.9)', border:'1px solid rgba(255,255,255,.12)',
          cursor:'pointer', fontSize:13, color:'rgba(255,255,255,.65)',
          display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow:'0 2px 10px rgba(0,0,0,.5)', zIndex:10
        }}>↓</button>
      )}

      {/* Staged files strip — images show thumbnail, count shown */}
      {state.staged.length > 0 && (
        <div style={{ padding:'6px 10px 4px', borderTop:'1px solid rgba(255,255,255,.05)',
          display:'flex', flexWrap:'wrap', gap:5, flexShrink:0, background:'#111113',
          alignItems:'center' }}>
          {/* File count indicator */}
          <span style={{ fontSize:9, color:`${role.color}99`, fontWeight:600,
            padding:'1px 6px', borderRadius:8, border:`1px solid ${role.color}33`,
            flexShrink:0, whiteSpace:'nowrap' }}>
            📎 {state.staged.length}/{MAX_FILES_TOTAL}
          </span>
          {state.staged.map((f, i) => {
            // Need to type-cast since staged is still File[] not AttachedFile[]
            const isImg = f.isImage ?? f.name.match(/\.(png|jpg|jpeg|gif|webp)$/i) != null
            return (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:4,
                padding:'2px 8px', borderRadius:8, fontSize:11,
                background: isImg ? `${role.color}18` : 'rgba(255,255,255,.06)',
                border:`1px solid ${isImg ? role.color+'44' : 'rgba(255,255,255,.08)'}`,
                color:'rgba(255,255,255,.65)', maxWidth:140 }}>
                <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:100 }}>
                  {isImg ? '🖼' : '📎'} {f.name}
                </span>
                <button onClick={() => onChange({ staged: state.staged.filter((_,j) => j!==i) })}
                  style={{ background:'none', border:'none', cursor:'pointer',
                    color:'rgba(255,255,255,.3)', padding:0, fontSize:13, lineHeight:1, flexShrink:0 }}>×</button>
              </div>
            )
          })}
        </div>
      )}

      {/* Input */}
      <div style={{ padding:'8px 10px 10px', borderTop:'1px solid rgba(255,255,255,.06)',
        flexShrink:0, background:'#111113' }}>
        <div style={{ display:'flex', gap:6, alignItems:'flex-end',
          background:'rgba(255,255,255,.045)',
          border:`1px solid ${(state.input||state.staged.length>0)?role.color+'55':'rgba(255,255,255,.07)'}`,
          borderRadius:14, padding:'7px 8px', transition:'border-color .2s' }}>

          {/* Attach */}
          <input ref={fileRef} type="file" multiple style={{ display:'none' }}
            onChange={async e => {
              if (!e.target.files) return
              const nf = await readFiles(Array.from(e.target.files), state.staged)
              onChange({ staged: nf }); e.target.value = ''
            }} />
          <Ico onClick={() => fileRef.current?.click()} title="Attach file" hoverColor={role.color}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21.44 11.05L12.25 20.24a6 6 0 01-8.49-8.49L14.21 1.3a4 4 0 015.66 5.66L9.64 17.21a2 2 0 01-2.83-2.83L16.49 4.71"/></svg>
          </Ico>

          {/* STT */}
          {stt.active && (
            <div style={{ display:'flex', alignItems:'center', gap:5, flexShrink:0,
              alignSelf:'flex-end', marginBottom:3, maxWidth:220 }}>
              {/* Pulsing dot — faster when speaking, slower when listening */}
              <div style={{ width:6, height:6, borderRadius:'50%', flexShrink:0,
                background: stt.isSpeaking ? '#ef4444' : '#f97316',
                boxShadow: stt.isSpeaking ? '0 0 8px #ef4444' : '0 0 4px #f97316',
                animation: `blink ${stt.isSpeaking ? '0.5s' : '1.4s'} ease-in-out infinite`,
                transition: 'all .3s'
              }}/>
              {/* Status label */}
              <span style={{
                fontSize:9, fontWeight:700, letterSpacing:'.05em',
                color: stt.isSpeaking ? '#ef4444' : '#f97316',
                flexShrink:0, transition:'color .3s'
              }}>
                {stt.isSpeaking ? 'Speaking…' : 'Listening…'}
              </span>
              {/* Live interim text preview */}
              {stt.interim && (
                <span style={{ fontSize:9, color:'rgba(239,68,68,.6)',
                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                  maxWidth:110, fontStyle:'italic' }}>
                  {stt.interim.slice(0, 35)}{stt.interim.length > 35 ? '…' : ''}
                </span>
              )}
              {/* Clear button */}
              <button onClick={stt.clear} title="Clear dictation"
                style={{ background:'none', border:'none', cursor:'pointer',
                  fontSize:11, color:'rgba(239,68,68,.4)', padding:'0 2px',
                  lineHeight:1, flexShrink:0 }}>✕</button>
            </div>
          )}
          <Ico onClick={() => stt.toggle(state.input.replace(/▍$/, ''))}
            title={stt.active ? 'Stop recording' : 'Voice input — starts from current text'}
            hoverColor={stt.active?'#ef4444':role.color} active={stt.active}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill={stt.active?'#ef4444':'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          </Ico>

          {/* Textarea — paste images + text. During STT: text has grey interim suffix */}
          <div style={{ flex:1, position:'relative', display:'flex' }}>
            <textarea ref={taRef} rows={1}
              value={state.input}
              onChange={e => {
                // If user types during STT, stop recording first
                if (stt.active) stt.clear()
                onChange({ input: e.target.value }); resize(e.target)
              }}
              onKeyDown={onKey}
              onPaste={async e => {
                const items = Array.from(e.clipboardData.items)
                const imageItems = items.filter(i => i.type.startsWith('image/'))
                if (imageItems.length === 0) return
                e.preventDefault()
                const newFiles = await readFiles(
                  imageItems.map(i => i.getAsFile()).filter(Boolean) as File[],
                  state.staged
                )
                onChange({ staged: newFiles })
              }}
              placeholder={stt.active ? '' : `Message ${role.label}…  ⌘↵ send · ⌘V paste image`}
              style={{ flex:1, background:'none', border:'none', outline:'none',
                resize:'none', fontSize:13, lineHeight:1.5,
                // During STT: interim text is greyed, blinking ▍ acts as cursor
                color: stt.active && stt.interim
                  ? 'rgba(228,226,221,.42)'  // all grey while interim active
                  : '#e4e2dd',
                minHeight:22, maxHeight:140, overflow:'hidden', fontFamily:'inherit',
                caretColor: stt.active ? 'transparent' : undefined,  // hide real cursor during STT
                // Blinking ▍ cursor effect via text-shadow animation on last char
                animation: stt.active ? 'none' : undefined
              }} />
          </div>

          {/* Send */}
          <button onClick={send}
            disabled={state.loading||(!state.input.trim()&&state.staged.length===0)}
            style={{ background:role.color, border:'none', cursor:'pointer',
              borderRadius:9, width:32, height:32, display:'flex', alignItems:'center',
              justifyContent:'center', flexShrink:0, transition:'opacity .15s',
              opacity:(state.input.trim()||state.staged.length>0)&&!state.loading?1:.35 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M22 2L11 13" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
              <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}


// ── Diff Viewer ───────────────────────────────────────────────────────────
function computeDiff(a: string, b: string): Array<{ type: 'same'|'del'|'add'; text: string }> {
  const aLines = a.split('\n')
  const bLines = b.split('\n')
  const result: Array<{ type: 'same'|'del'|'add'; text: string }> = []

  // Simple LCS-based line diff
  const m = aLines.length, n = bLines.length
  const dp: number[][] = Array.from({ length: m+1 }, () => new Array(n+1).fill(0))
  for (let i = m-1; i >= 0; i--)
    for (let j = n-1; j >= 0; j--)
      dp[i][j] = aLines[i] === bLines[j] ? dp[i+1][j+1]+1 : Math.max(dp[i+1][j], dp[i][j+1])

  let i = 0, j = 0
  while (i < m || j < n) {
    if (i < m && j < n && aLines[i] === bLines[j]) {
      result.push({ type: 'same', text: aLines[i] }); i++; j++
    } else if (j < n && (i >= m || dp[i+1]?.[j] <= dp[i]?.[j+1])) {
      result.push({ type: 'add', text: bLines[j] }); j++
    } else {
      result.push({ type: 'del', text: aLines[i] }); i++
    }
  }
  return result
}

function DiffViewer({ versions, onClose }: {
  versions: Array<{ version: number; content: string; ts: Date }>
  onClose:  () => void
}) {
  const [leftV,  setLeftV]  = useState(versions[0]?.version ?? 1)
  const [rightV, setRightV] = useState(versions[versions.length-1]?.version ?? 1)

  const leftDoc  = versions.find(v => v.version === leftV)
  const rightDoc = versions.find(v => v.version === rightV)

  const diff = leftDoc && rightDoc ? computeDiff(leftDoc.content, rightDoc.content) : []

  const added   = diff.filter(l => l.type === 'add').length
  const deleted = diff.filter(l => l.type === 'del').length
  const same    = diff.filter(l => l.type === 'same').length
  const total   = added + deleted + same
  const changePct = total > 0 ? Math.round((added + deleted) / total * 100) : 0

  return (
    <div style={{ position:'fixed', inset:0, zIndex:300, display:'flex', flexDirection:'column',
      background:'#0a0a0c' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 20px',
        borderBottom:'1px solid rgba(255,255,255,.08)', flexShrink:0 }}>
        <span style={{ fontSize:14, fontWeight:700 }}>⚖️ Diff Viewer</span>

        {/* Version selectors */}
        <div style={{ display:'flex', alignItems:'center', gap:8, marginLeft:8 }}>
          <span style={{ fontSize:11, color:'rgba(255,255,255,.3)' }}>Compare:</span>
          <select value={leftV} onChange={e => setLeftV(Number(e.target.value))}
            style={{ background:'#1e1e22', border:'1px solid rgba(255,255,255,.15)',
              borderRadius:6, padding:'3px 8px', fontSize:12, color:'#e4e2dd', cursor:'pointer' }}>
            {versions.map(v => <option key={v.version} value={v.version}>v{v.version}</option>)}
          </select>
          <span style={{ color:'rgba(255,255,255,.3)', fontSize:13 }}>→</span>
          <select value={rightV} onChange={e => setRightV(Number(e.target.value))}
            style={{ background:'#1e1e22', border:'1px solid rgba(255,255,255,.15)',
              borderRadius:6, padding:'3px 8px', fontSize:12, color:'#e4e2dd', cursor:'pointer' }}>
            {versions.map(v => <option key={v.version} value={v.version}>v{v.version}</option>)}
          </select>
        </div>

        {/* Stats */}
        <div style={{ display:'flex', gap:10, marginLeft:8 }}>
          <span style={{ fontSize:11, color:'#10a37f' }}>+{added} added</span>
          <span style={{ fontSize:11, color:'#ef4444' }}>−{deleted} removed</span>
          <span style={{ fontSize:11, color:'rgba(255,255,255,.3)' }}>{changePct}% changed</span>
        </div>

        <div style={{ flex:1 }}/>
        <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer',
          color:'rgba(255,255,255,.4)', fontSize:18, lineHeight:1, padding:'0 4px' }}>×</button>
      </div>

      {/* Diff content */}
      <div style={{ flex:1, overflowY:'auto', padding:'16px 20px',
        fontFamily:'ui-monospace, "Cascadia Code", monospace', fontSize:12, lineHeight:1.7,
        scrollbarWidth:'thin', scrollbarColor:'rgba(255,255,255,.08) transparent' }}>
        {leftDoc === rightDoc ? (
          <div style={{ color:'rgba(255,255,255,.3)', textAlign:'center', paddingTop:60, fontSize:13 }}>
            Select two different versions to compare.
          </div>
        ) : diff.length === 0 ? (
          <div style={{ color:'rgba(255,255,255,.3)', textAlign:'center', paddingTop:60, fontSize:13 }}>
            No differences found.
          </div>
        ) : (
          <div>
            {diff.map((line, i) => (
              <div key={i} style={{
                display:'flex', gap:0,
                background: line.type==='add' ? 'rgba(16,163,127,.12)'
                          : line.type==='del' ? 'rgba(239,68,68,.1)' : 'transparent',
                borderLeft: `3px solid ${
                  line.type==='add' ? '#10a37f' :
                  line.type==='del' ? '#ef4444' : 'transparent'
                }`,
                marginBottom: line.type === 'same' ? 0 : 1,
              }}>
                <span style={{ width:20, flexShrink:0, color:
                  line.type==='add'?'#10a37f':
                  line.type==='del'?'#ef4444':'rgba(255,255,255,.2)',
                  userSelect:'none', paddingLeft:4, fontSize:11 }}>
                  {line.type==='add'?'+':line.type==='del'?'−':' '}
                </span>
                <span style={{ flex:1, padding:'0 8px', color:
                  line.type==='add'?'#7de8c0':
                  line.type==='del'?'#f8a0a0':'rgba(255,255,255,.6)',
                  whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
                  {line.text || ' '}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}


// ── Prompt Inspector ──────────────────────────────────────────────────────
interface InspectorData {
  roleId:     string
  roleLabel:  string
  systemPrompt: string
  messages:   Array<{ role: string; content: string }>
  fileCtx:    string
  totalChars: number
  estimatedTokens: number
}

function PromptInspector({ data, onClose }: { data: InspectorData; onClose: () => void }) {
  const [tab, setTab] = useState<'messages' | 'system' | 'files'>('messages')
  const [copied, setCopied] = useState(false)

  const fullPayload = JSON.stringify({
    system: data.systemPrompt,
    messages: data.messages,
  }, null, 2)

  const copyAll = () => {
    navigator.clipboard.writeText(fullPayload)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  const roleColor = data.roleId === 'dashka' ? '#10a37f'
    : data.roleId === 'claude' ? '#7c6af7' : '#c84b31'

  return (
    <div style={{ position:'fixed', inset:0, zIndex:500, display:'flex', flexDirection:'column',
      background:'#0a0a0c' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 20px',
        borderBottom:'1px solid rgba(255,255,255,.08)', flexShrink:0, background:'#0a0a0c' }}>
        <div style={{ width:8, height:8, borderRadius:'50%', background:roleColor,
          boxShadow:`0 0 8px ${roleColor}` }}/>
        <span style={{ fontSize:14, fontWeight:700 }}>
          📊 Prompt Inspector — {data.roleLabel}
        </span>

        {/* Stats */}
        <div style={{ display:'flex', gap:14, marginLeft:8 }}>
          <span style={{ fontSize:11, color:'rgba(255,255,255,.4)' }}>
            {data.messages.length} messages
          </span>
          <span style={{ fontSize:11, color:'rgba(255,255,255,.4)' }}>
            ~{data.estimatedTokens.toLocaleString()} tokens
          </span>
          <span style={{ fontSize:11, color: data.estimatedTokens > 80000 ? '#ef4444' : data.estimatedTokens > 40000 ? '#f59e0b' : '#10a37f' }}>
            {data.estimatedTokens > 80000 ? '⚠️ Large context' : data.estimatedTokens > 40000 ? '⚡ Medium context' : '✓ Lean context'}
          </span>
        </div>

        <div style={{ flex:1 }}/>
        <button onClick={copyAll} style={{
          background:'rgba(255,255,255,.07)', border:'1px solid rgba(255,255,255,.15)',
          borderRadius:7, cursor:'pointer', fontSize:11, padding:'5px 12px',
          color: copied ? '#10a37f' : 'rgba(255,255,255,.6)' }}>
          {copied ? '✓ Copied' : '📋 Copy payload'}
        </button>
        <button onClick={onClose} style={{ background:'none', border:'none',
          cursor:'pointer', color:'rgba(255,255,255,.4)', fontSize:20, lineHeight:1 }}>×</button>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:0, borderBottom:'1px solid rgba(255,255,255,.07)',
        flexShrink:0, background:'#0d0d0f' }}>
        {([['messages', `💬 Messages (${data.messages.length})`],
           ['system',   '⚙️ System Prompt'],
           ['files',    `📎 File Context (${data.fileCtx ? (data.fileCtx.length/1000).toFixed(1)+'KB' : 'none'})`]
        ] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            background: tab === id ? 'rgba(255,255,255,.06)' : 'none',
            border:'none', borderBottom: tab===id ? `2px solid ${roleColor}` : '2px solid transparent',
            cursor:'pointer', fontSize:12, padding:'10px 18px',
            color: tab===id ? '#e4e2dd' : 'rgba(255,255,255,.4)',
            transition:'all .15s'
          }}>{label}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex:1, overflowY:'auto', padding:'16px 20px',
        fontFamily:'ui-monospace, "Cascadia Code", monospace', fontSize:12, lineHeight:1.7,
        scrollbarWidth:'thin', scrollbarColor:'rgba(255,255,255,.08) transparent' }}>

        {tab === 'messages' && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {data.messages.map((m, i) => (
              <div key={i} style={{
                padding:'10px 14px', borderRadius:10,
                background: m.role === 'user' ? 'rgba(255,255,255,.04)' : `${roleColor}12`,
                border:`1px solid ${m.role === 'user' ? 'rgba(255,255,255,.07)' : roleColor+'25'}`,
                borderLeft: m.role !== 'user' ? `3px solid ${roleColor}` : undefined,
              }}>
                <div style={{ fontSize:9, fontWeight:700, letterSpacing:'.1em',
                  color: m.role === 'user' ? 'rgba(255,255,255,.3)' : roleColor,
                  marginBottom:6, textTransform:'uppercase' }}>
                  {m.role} · {m.content.length.toLocaleString()} chars
                </div>
                <div style={{ color:'rgba(255,255,255,.7)', whiteSpace:'pre-wrap',
                  wordBreak:'break-word', maxHeight:300, overflowY:'auto' }}>
                  {m.content}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'system' && (
          <div style={{ padding:'12px 16px', borderRadius:10,
            background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.07)',
            color:'rgba(255,255,255,.7)', whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
            {data.systemPrompt}
          </div>
        )}

        {tab === 'files' && (
          data.fileCtx ? (
            <div style={{ padding:'12px 16px', borderRadius:10,
              background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.07)',
              color:'rgba(255,255,255,.7)', whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
              {data.fileCtx}
            </div>
          ) : (
            <div style={{ color:'rgba(255,255,255,.25)', textAlign:'center', paddingTop:60, fontSize:13 }}>
              No file context in this conversation.
            </div>
          )
        )}
      </div>
    </div>
  )
}

// ── Saved Files Panel ─────────────────────────────────────────────────────
function SavedPanel({ onClose, onDragStart, onSendToChat }: {
  onClose:       () => void
  onDragStart:   (f: SavedFile, e: React.DragEvent) => void
  onSendToChat:  (role: RoleId, f: SavedFile) => void
}) {
  const [files, setFiles] = useState<SavedFile[]>([])
  const [preview, setPreview] = useState<string | null>(null)

  const refresh = () => setFiles(lsGetFiles())
  useEffect(() => { refresh() }, [])

  const del = (id: string) => {
    const next = files.filter(f => f.id !== id)
    setFiles(next); localStorage.setItem('sl_saved_files', JSON.stringify(next))
    if (preview === id) setPreview(null)
  }

  const RCOLOR: Record<string, string> = { dashka:'#10a37f', claude:'#7c6af7', consultant:'#c84b31', system:'#888' }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:200 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.55)' }} onClick={onClose}/>
      <div style={{ position:'absolute', right:0, top:0, bottom:0, width:370,
        background:'#111113', borderLeft:'1px solid rgba(255,255,255,.08)',
        display:'flex', flexDirection:'column', zIndex:201 }}>

        <div style={{ padding:'14px 16px', borderBottom:'1px solid rgba(255,255,255,.07)',
          display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:14, fontWeight:600, flex:1 }}>📁 Saved Files</span>
          <span style={{ fontSize:10, color:'rgba(255,255,255,.25)' }}>{files.length} files · drag to chat</span>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer',
            color:'rgba(255,255,255,.4)', fontSize:18, lineHeight:1, padding:'0 4px' }}>×</button>
        </div>

        {files.length === 0 && (
          <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center',
            justifyContent:'center', gap:8, color:'rgba(255,255,255,.2)', textAlign:'center', padding:24 }}>
            <div style={{ fontSize:28 }}>📂</div>
            <div style={{ fontSize:12 }}>No saved files yet.<br/>Click 💾 on any AI message.</div>
          </div>
        )}

        <div style={{ flex:1, overflowY:'auto', scrollbarWidth:'thin',
          scrollbarColor:'rgba(255,255,255,.07) transparent' }}>
          {files.map(f => (
            <div key={f.id}
              draggable
              onDragStart={e => { e.dataTransfer.setData('sl_saved_file_id', f.id); onDragStart(f, e) }}
              style={{ borderBottom:'1px solid rgba(255,255,255,.04)', cursor:'grab' }}>
              <div style={{ padding:'10px 14px',
                background: preview===f.id ? 'rgba(255,255,255,.04)' : 'none',
                transition:'background .15s' }}
                onClick={() => setPreview(preview===f.id ? null : f.id)}>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <div style={{ width:6, height:6, borderRadius:'50%', flexShrink:0,
                    background: RCOLOR[f.role] ?? '#888' }}/>
                  <span style={{ fontSize:12, fontWeight:500, flex:1,
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {f.name}
                  </span>
                  {f.version && (
                    <span style={{ fontSize:9, padding:'1px 5px', borderRadius:6,
                      border:`1px solid ${RCOLOR[f.role]??'#888'}55`,
                      color: RCOLOR[f.role]??'#888' }}>v{f.version}</span>
                  )}
                </div>
                <div style={{ fontSize:10, color:'rgba(255,255,255,.22)', marginTop:3, paddingLeft:12 }}>
                  {new Date(f.savedAt).toLocaleString()} · {f.content.length.toLocaleString()} chars
                </div>
                <div style={{ display:'flex', gap:4, marginTop:6, paddingLeft:12, flexWrap:'wrap' }}>
                  <SmBtn onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(f.content) }}>📋 Copy</SmBtn>
                  <SmBtn onClick={e => { e.stopPropagation(); saveAndDownload(f.content, f.name, f.role, f.version) }}>⬇ Download</SmBtn>
                  <SmBtn onClick={e => { e.stopPropagation(); onSendToChat('claude', f) }}
                    style={{ color:'#7c6af7', borderColor:'#7c6af755' }}>🟣→</SmBtn>
                  <SmBtn onClick={e => { e.stopPropagation(); onSendToChat('consultant', f) }}
                    style={{ color:'#c84b31', borderColor:'#c84b3155' }}>🔴→</SmBtn>
                  <SmBtn onClick={e => { e.stopPropagation(); del(f.id) }} red>🗑</SmBtn>
                </div>
              </div>
              {preview===f.id && (
                <div style={{ padding:'0 14px 12px', fontSize:11, lineHeight:1.6,
                  color:'rgba(255,255,255,.5)', whiteSpace:'pre-wrap', wordBreak:'break-word',
                  maxHeight:180, overflowY:'auto', borderTop:'1px solid rgba(255,255,255,.04)',
                  background:'#0e0e10', fontFamily:'ui-monospace,monospace' }}>
                  {f.content.slice(0,1400)}
                  {f.content.length>1400 && <span style={{ color:'rgba(255,255,255,.2)' }}> …{(f.content.length-1400).toLocaleString()} more</span>}
                </div>
              )}
            </div>
          ))}
        </div>

        {files.length > 0 && (
          <div style={{ padding:'10px 14px', borderTop:'1px solid rgba(255,255,255,.07)',
            display:'flex', gap:8 }}>
            <SmBtn onClick={() => { if (confirm('Clear all?')) { localStorage.removeItem('sl_saved_files'); setFiles([]) } }} red>🗑 Clear all</SmBtn>
            <SmBtn onClick={refresh}>↺ Refresh</SmBtn>
          </div>
        )}
      </div>
    </div>
  )
}

function SmBtn({ onClick, children, red, style: extraStyle }: { onClick: (e: React.MouseEvent) => void; children: React.ReactNode; red?: boolean; style?: React.CSSProperties }) {
  return (
    <button onClick={onClick} style={{
      background:'rgba(255,255,255,.05)', border:`1px solid ${red?'rgba(239,68,68,.2)':'rgba(255,255,255,.08)'}`,
      borderRadius:6, cursor:'pointer', fontSize:10, padding:'2px 8px',
      color: red ? '#ef444466' : 'rgba(255,255,255,.4)', transition:'all .15s',
      ...extraStyle
    }}>{children}</button>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
// ── DB helpers ──────────────────────────────────────────────────────────
type DBCase = { id: string; title: string; created_at: number; updated_at: number }

async function dbListCases(): Promise<DBCase[]> {
  try {
    const res = await fetch('/legal/api/db?action=cases')
    return res.ok ? res.json() : []
  } catch { return [] }
}

async function dbCreateCase(title: string): Promise<string | null> {
  try {
    const res  = await fetch('/legal/api/db', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'create', title }) })
    const data = await res.json()
    return data.id ?? null
  } catch { return null }
}

async function dbLoadCase(id: string): Promise<{ messages: Array<{id:string;role_col:string;msg_role:string;content:string;ts:number;version:number|null;edited:boolean;parentId:string|null;files:AttachedFile[]}> } | null> {
  try {
    const res = await fetch(`/legal/api/db?action=case&id=${id}`)
    return res.ok ? res.json() : null
  } catch { return null }
}

async function dbUpsertMsg(caseId: string, roleCol: RoleId, msg: ChatMsg) {
  try {
    await fetch('/legal/api/db', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'upsert_msg', caseId, roleCol, msg }) })
  } catch {}
}

async function dbDeleteCase(id: string) {
  try {
    await fetch('/legal/api/db', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'delete_case', id }) })
  } catch {}
}

export default function LegalPage() {
  const [cols, setCols] = useState<Record<RoleId, ColState>>({
    dashka:     { messages:[], input:'', loading:false, staged:[] as AttachedFile[], dragOver:false, abortCtrl:null },
    claude:     { messages:[], input:'', loading:false, staged:[] as AttachedFile[], dragOver:false, abortCtrl:null },
    consultant: { messages:[], input:'', loading:false, staged:[] as AttachedFile[], dragOver:false, abortCtrl:null },
  })
  const [showPanel,   setShowPanel]   = useState(false)
  const [savedFiles,  setSavedFiles]  = useState<SavedFile[]>([])
  const [dbCases,     setDbCases]     = useState<DBCase[]>([])
  const [activeCaseId,setActiveCaseId]= useState<string | null>(null)
  const [showCases,   setShowCases]   = useState(false)
  const [newCaseName, setNewCaseName] = useState('')

  useEffect(() => { setSavedFiles(lsGetFiles()) }, [showPanel])

  // Load cases list on mount
  useEffect(() => { dbListCases().then(setDbCases) }, [])

  // Auto-persist: save every new AI message to DB when activeCaseId is set
  useEffect(() => {
    if (!activeCaseId) return
    for (const r of ROLE_IDS) {
      const msgs = cols[r].messages
      const last = msgs[msgs.length - 1]
      if (last && last.role === 'ai' && !cols[r].loading) {
        dbUpsertMsg(activeCaseId, r, last)
      }
    }
  }, [cols, activeCaseId])

  const update = useCallback((id: RoleId, patch: Partial<ColState> | ((prev: ColState) => Partial<ColState>)) => {
    setCols(p => {
      const resolved = typeof patch === 'function' ? patch(p[id]) : patch
      return { ...p, [id]: { ...p[id], ...resolved } }
    })
  }, [])

  // When a saved file is dropped onto a chat column
  const dropFromPanel = useCallback((roleId: RoleId, sf: SavedFile) => {
    const af: AttachedFile = { fid: uid(), name: sf.name, content: sf.content, size: sf.content.length, isImage: false }
    update(roleId, { staged: [...cols[roleId].staged, af] })
  }, [cols, update])

  const anyLoading = ROLE_IDS.some(r => cols[r].loading)

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh',
      background:'#0e0e10', color:'#e4e2dd',
      fontFamily:'-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
      overflow:'hidden' }}>

      {/* Header */}
      <header style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'0 18px', height:48, borderBottom:'1px solid rgba(255,255,255,.07)',
        background:'#0a0a0c', flexShrink:0, zIndex:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <Link href="/" style={{ fontSize:12, color:'rgba(255,255,255,.28)', textDecoration:'none' }}>← App</Link>
          <span style={{ fontSize:15, fontWeight:700 }}>
            Solar <span style={{ color:'#10a37f' }}>Legal</span> Style
          </span>
          <div style={{ display:'flex', gap:5 }}>
            {ROLE_IDS.map(r => {
              const c = cols[r]; const role = ROLES[r]
              const aiCnt = c.messages.filter(m => m.role==='ai').length
              const verCnt = c.messages.filter(m => m.role==='ai' && m.version).length
              return (
                <div key={r} style={{ display:'flex', alignItems:'center', gap:4,
                  padding:'2px 9px', borderRadius:20, fontSize:11,
                  background:'rgba(255,255,255,.04)',
                  border:`1px solid ${c.loading?role.color+'66':'rgba(255,255,255,.07)'}`,
                  transition:'border-color .3s' }}>
                  <div style={{ width:5, height:5, borderRadius:'50%',
                    background: c.loading?role.color:aiCnt>0?role.color+'77':'rgba(255,255,255,.18)',
                    boxShadow: c.loading?`0 0 5px ${role.color}`:'none', transition:'all .3s' }}/>
                  <span style={{ color:'rgba(255,255,255,.4)' }}>{role.label.split(' ')[0]}</span>
                  {aiCnt>0 && <span style={{ color:role.color, fontWeight:600 }}>{aiCnt}</span>}
                  {verCnt>0 && <span style={{ color:role.color, fontSize:9 }}>·v{verCnt}</span>}
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {/* Cases DB button */}
          <button onClick={() => setShowCases(!showCases)} style={{
            background: activeCaseId ? 'rgba(16,163,127,.15)' : 'rgba(255,255,255,.05)',
            border: `1px solid ${activeCaseId ? 'rgba(16,163,127,.4)' : 'rgba(255,255,255,.1)'}`,
            borderRadius:8, cursor:'pointer', fontSize:11, padding:'5px 11px',
            color: activeCaseId ? '#10a37f' : 'rgba(255,255,255,.55)',
            display:'flex', alignItems:'center', gap:5
          }}>
            🗂 {activeCaseId ? `Case #${dbCases.findIndex(c=>c.id===activeCaseId)+1}` : 'Cases'}
            {dbCases.length > 0 && <span style={{ color:'rgba(255,255,255,.3)', fontSize:10 }}>{dbCases.length}</span>}
          </button>
          <div style={{ fontSize:10, color:'rgba(255,255,255,.18)' }}>
            🎤 voice · 📎 attach · 💾 save · drag & drop
          </div>
          <button onClick={() => { exportCaseBundle(cols) }} disabled={anyLoading}
            style={{ background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.1)',
              borderRadius:8, cursor:'pointer', fontSize:11, padding:'5px 11px',
              color:'rgba(255,255,255,.55)', display:'flex', alignItems:'center', gap:4 }}>
            ⬇ Export Case
          </button>
          <button onClick={() => setShowPanel(!showPanel)}
            style={{ background: showPanel?'rgba(255,255,255,.1)':'rgba(255,255,255,.05)',
              border:'1px solid rgba(255,255,255,.1)',
              borderRadius:8, cursor:'pointer', fontSize:11, padding:'5px 11px',
              color:'rgba(255,255,255,.6)', display:'flex', alignItems:'center', gap:4 }}>
            📁 Files {savedFiles.length > 0 && <span style={{ color:'#10a37f', fontWeight:700 }}>{savedFiles.length}</span>}
          </button>
        </div>
      </header>

      {/* Three columns */}
      <div style={{ flex:1, display:'grid', gridTemplateColumns:'1fr 1fr 1fr',
        overflow:'hidden', position:'relative' }}>
        {ROLE_IDS.map(r => (
          <ChatCol key={r} roleId={r} state={cols[r]}
            onChange={p => update(r, p)}
            savedFiles={savedFiles}
            onDropFromPanel={sf => dropFromPanel(r, sf)} />
        ))}
      </div>

      {/* Cases sidebar */}
      {showCases && (
        <div style={{ position:'fixed', inset:0, zIndex:200 }} onClick={() => setShowCases(false)}>
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.5)' }}/>
          <div style={{ position:'absolute', left:0, top:0, bottom:0, width:320,
            background:'#111113', borderRight:'1px solid rgba(255,255,255,.08)',
            display:'flex', flexDirection:'column', zIndex:201 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding:'14px 16px', borderBottom:'1px solid rgba(255,255,255,.07)',
              display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:14, fontWeight:600, flex:1 }}>🗂 Cases</span>
              <button onClick={() => setShowCases(false)} style={{ background:'none', border:'none',
                cursor:'pointer', color:'rgba(255,255,255,.4)', fontSize:18 }}>×</button>
            </div>

            {/* New case */}
            <div style={{ padding:'10px 14px', borderBottom:'1px solid rgba(255,255,255,.06)' }}>
              <div style={{ display:'flex', gap:6 }}>
                <input value={newCaseName} onChange={e => setNewCaseName(e.target.value)}
                  placeholder="Case name…"
                  onKeyDown={e => { if (e.key==='Enter' && newCaseName.trim()) {
                    dbCreateCase(newCaseName.trim()).then(id => { if (id) { setActiveCaseId(id); setDbCases(p => [{id, title:newCaseName, created_at:Date.now()/1000, updated_at:Date.now()/1000},...p]); setNewCaseName(''); setCols({ dashka:{messages:[],input:'',loading:false,staged:[],dragOver:false,abortCtrl:null}, claude:{messages:[],input:'',loading:false,staged:[],dragOver:false,abortCtrl:null}, consultant:{messages:[],input:'',loading:false,staged:[],dragOver:false,abortCtrl:null} }) } })
                  }}}
                  style={{ flex:1, background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)',
                    borderRadius:7, padding:'6px 10px', fontSize:12, color:'#e4e2dd', outline:'none' }} />
                <button onClick={() => { if (!newCaseName.trim()) return; dbCreateCase(newCaseName.trim()).then(id => { if (id) { setActiveCaseId(id); setDbCases(p => [{id, title:newCaseName, created_at:Date.now()/1000, updated_at:Date.now()/1000},...p]); setNewCaseName(''); setCols({ dashka:{messages:[],input:'',loading:false,staged:[],dragOver:false,abortCtrl:null}, claude:{messages:[],input:'',loading:false,staged:[],dragOver:false,abortCtrl:null}, consultant:{messages:[],input:'',loading:false,staged:[],dragOver:false,abortCtrl:null} }) } }) }}
                  style={{ background:'#10a37f', border:'none', borderRadius:7, cursor:'pointer',
                    fontSize:12, padding:'6px 10px', color:'#fff', fontWeight:600 }}>+ New</button>
              </div>
            </div>

            {/* Case list */}
            <div style={{ flex:1, overflowY:'auto', scrollbarWidth:'thin', scrollbarColor:'rgba(255,255,255,.07) transparent' }}>
              {dbCases.length === 0 && (
                <div style={{ padding:24, textAlign:'center', color:'rgba(255,255,255,.2)', fontSize:12 }}>
                  No saved cases yet.<br/>Create one above.
                </div>
              )}
              {dbCases.map(cas => (
                <div key={cas.id}
                  onClick={() => {
                    setActiveCaseId(cas.id)
                    // Load messages from DB
                    dbLoadCase(cas.id).then(data => {
                      if (!data) return
                      const byRole: Record<RoleId, ChatMsg[]> = { dashka:[], claude:[], consultant:[] }
                      for (const m of data.messages) {
                        const r = m.role_col as RoleId
                        if (!byRole[r]) continue
                        byRole[r].push({
                          id: String(m.id), role: m.msg_role === 'ai' ? 'ai' : 'user',
                          content: String(m.content), files: m.files,
                          ts: new Date(m.ts), version: m.version ?? undefined,
                          edited: m.edited, parentId: m.parentId ?? undefined
                        })
                      }
                      setCols({
                        dashka:     { messages:byRole.dashka,     input:'', loading:false, staged:[], dragOver:false, abortCtrl:null },
                        claude:     { messages:byRole.claude,      input:'', loading:false, staged:[], dragOver:false, abortCtrl:null },
                        consultant: { messages:byRole.consultant,  input:'', loading:false, staged:[], dragOver:false, abortCtrl:null },
                      })
                    })
                    setShowCases(false)
                  }}
                  style={{ padding:'10px 16px', cursor:'pointer', borderBottom:'1px solid rgba(255,255,255,.04)',
                    background: cas.id === activeCaseId ? 'rgba(16,163,127,.1)' : 'none',
                    borderLeft: `3px solid ${cas.id === activeCaseId ? '#10a37f' : 'transparent'}`,
                    transition:'all .15s' }}>
                  <div style={{ fontSize:13, fontWeight:500, color: cas.id===activeCaseId?'#10a37f':'#e4e2dd' }}>{cas.title}</div>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,.25)', marginTop:2 }}>
                    {new Date(Number(cas.updated_at)*1000).toLocaleString()}
                  </div>
                  <div style={{ display:'flex', gap:6, marginTop:5 }}>
                    <button onClick={e => { e.stopPropagation(); dbDeleteCase(cas.id).then(() => { setDbCases(p=>p.filter(x=>x.id!==cas.id)); if (activeCaseId===cas.id) setActiveCaseId(null) }) }}
                      style={{ background:'none', border:'1px solid rgba(239,68,68,.2)', borderRadius:5,
                        cursor:'pointer', fontSize:10, padding:'1px 7px', color:'rgba(239,68,68,.5)' }}>🗑 Delete</button>
                  </div>
                </div>
              ))}
            </div>

            {activeCaseId && (
              <div style={{ padding:'10px 14px', borderTop:'1px solid rgba(255,255,255,.07)' }}>
                <div style={{ fontSize:10, color:'rgba(255,255,255,.3)', marginBottom:6 }}>
                  Active: {dbCases.find(c=>c.id===activeCaseId)?.title}
                </div>
                <button onClick={() => { setActiveCaseId(null); setCols({ dashka:{messages:[],input:'',loading:false,staged:[],dragOver:false,abortCtrl:null}, claude:{messages:[],input:'',loading:false,staged:[],dragOver:false,abortCtrl:null}, consultant:{messages:[],input:'',loading:false,staged:[],dragOver:false,abortCtrl:null} }) }}
                  style={{ background:'none', border:'1px solid rgba(255,255,255,.15)', borderRadius:7,
                    cursor:'pointer', fontSize:11, padding:'4px 10px', color:'rgba(255,255,255,.4)' }}>
                  ✕ Close case
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showPanel && (
        <SavedPanel
          onClose={() => setShowPanel(false)}
          onDragStart={() => {}}
          onSendToChat={(role, sf) => {
            const af: AttachedFile = { fid: uid(), name: sf.name, content: sf.content, size: sf.content.length, isImage: false }
            update(role, { staged: [...cols[role].staged, af] })
            setShowPanel(false)
          }}
        />
      )}

      <style>{`
        @keyframes blink {
          0%,100% { opacity:.25; transform:scale(.8); }
          50%      { opacity:1;   transform:scale(1.1); }
        }
        @keyframes pulse-stop {
          0%,100% { opacity:.7; }
          50%      { opacity:1; }
        }
        @keyframes cursor-blink {
          0%,49%  { opacity:1; }
          50%,100%{ opacity:0; }
        }
      `}</style>
    </div>
  )
}
