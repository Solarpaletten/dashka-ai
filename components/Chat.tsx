'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import ContextToggle from './ContextToggle'
import { renderMarkdown } from '@/lib/markdown'
import { extractFiles }   from '@/lib/files'
import FileBar            from './FileBar'
import type { Message, AIProvider, RouterResponse } from '@/lib/ai/types'

type ChatMode = 'gpt' | 'claude' | 'auto'
interface SharedMsg { role: string; content: string; source: string }

interface Props {
  ai: 'gpt' | 'claude'
  isOpen: boolean
  onClose: () => void
  onSwitchAI: () => void        // navigate to the other AI panel
  sharedBuffer: SharedMsg[]
  onPushShared: (role: string, content: string, source: string) => void
}

interface DisplayMsg {
  role: 'user' | 'assistant' | 'system'
  content: string
  streaming?: boolean
}



// ── Message bubble ─────────────────────────────────────────────────────
function Bubble({ msg, isDark }: { msg: DisplayMsg; isDark: boolean }) {
  if (msg.role === 'system')
    return <div className="chat-msg-system">{msg.content}</div>

  if (msg.role === 'user')
    return <div className="chat-msg chat-msg--user">{msg.content}</div>

  const html  = renderMarkdown(msg.content)
  const files = msg.streaming ? [] : extractFiles(msg.content)

  return (
    <div className="chat-msg-ai-wrap">
      <div
        className={`chat-msg chat-msg--assistant chat-msg--md ${isDark ? 'md-dark' : 'md-light'}`}
        dangerouslySetInnerHTML={{
          __html: html + (msg.streaming ? '<span class="stream-cursor" aria-hidden>▋</span>' : '')
        }}
      />
      <FileBar files={files} isDark={isDark} />
    </div>
  )
}

const PROVIDER_LABELS: Record<AIProvider, string> = { gpt: 'GPT-4o', claude: 'Claude', ollama: 'Ollama' }
const MODE_LABELS: Record<string, string> = {
  single: '⚡ Auto', dual: '⚡ Best of 2', triple: '⚡ Best of 3',
  'early-exit': '⚡ Early exit', cached: '⚡ Cached', explore: '🎲 Explore'
}

// ── Main component ─────────────────────────────────────────────────────
export default function Chat({ ai, isOpen, onClose, onSwitchAI, sharedBuffer, onPushShared }: Props) {
  const [msgs, setMsgs]         = useState<DisplayMsg[]>([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [chatMode, setChatMode] = useState<ChatMode>(ai)
  const [ctxOn, setCtxOn]       = useState(false)
  const msgsRef  = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const isDark   = ai === 'gpt'
  const other    = ai === 'gpt' ? 'claude' : 'gpt'
  const otherLabel = ai === 'gpt' ? 'Claude →' : '← GPT'

  useEffect(() => { if (isOpen) setTimeout(() => inputRef.current?.focus(), 420) }, [isOpen])
  useEffect(() => { const el = msgsRef.current; if (el) el.scrollTop = el.scrollHeight }, [msgs])

  const getContext = useCallback((): string | null => {
    if (!ctxOn || !sharedBuffer.length) return null
    return sharedBuffer.map(m => {
      const who = m.source === 'user' ? 'User' : m.source === 'gpt' ? 'ChatGPT' : 'Claude'
      return `[${who}]: ${m.content}`
    }).join('\n')
  }, [ctxOn, sharedBuffer])

  const history = (): Message[] =>
    msgs.filter(m => m.role !== 'system')
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  const addMsg    = (m: DisplayMsg) => setMsgs(p => [...p, m])
  const addSystem = (text: string)  => addMsg({ role: 'system', content: text })

  // ── Streaming ──────────────────────────────────────────────────────
  const streamReply = async (hist: Message[], provider: 'gpt' | 'claude'): Promise<string> => {
    abortRef.current = new AbortController()
    const res = await fetch('/api/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: hist, context: getContext(), provider }),
      signal: abortRef.current.signal
    })
    if (!res.ok || !res.body) throw new Error(`Stream ${res.status}`)

    setMsgs(p => [...p, { role: 'assistant', content: '', streaming: true }])
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let full = ''

    outer: while (true) {
      const { done, value } = await reader.read()
      if (done) break
      for (const line of decoder.decode(value, { stream: true }).split('\n')) {
        const t = line.trim()
        if (!t.startsWith('data:')) continue
        const d = t.slice(5).trim()
        if (d === '[DONE]') break outer
        try {
          const json = JSON.parse(d)
          if (json.error) throw new Error(json.error)
          if (json.token) {
            full += json.token
            const snap = full
            setMsgs(p => {
              const next = [...p]
              const last = next[next.length - 1]
              if (last?.streaming) next[next.length - 1] = { ...last, content: snap }
              return next
            })
          }
        } catch (e) { if ((e as Error).message !== 'JSON') throw e }
      }
    }
    setMsgs(p => p.map((m, i) => i === p.length - 1 && m.streaming ? { ...m, streaming: false } : m))
    return full
  }

  // ── Router (non-streaming, needs judge) ────────────────────────────
  const fetchRouter = async (hist: Message[]): Promise<RouterResponse> => {
    abortRef.current = new AbortController()
    const res = await fetch('/api/router', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: hist, context: getContext() }),
      signal: abortRef.current.signal
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Router failed')
    return data
  }

  // ── Send ──────────────────────────────────────────────────────────
  const handleSend = async () => {
    const msg = input.trim()
    if (!msg || loading) return
    setInput(''); setLoading(true)
    setMsgs(p => [...p, { role: 'user', content: msg }])
    onPushShared('user', msg, 'user')
    const hist = [...history(), { role: 'user' as const, content: msg }]

    try {
      if (chatMode === 'auto') {
        const data = await fetchRouter(hist)
        addMsg({ role: 'assistant', content: data.reply })
        onPushShared('assistant', data.reply, ai)
        const prov  = PROVIDER_LABELS[data.provider]
        const conf  = data.confidence != null ? ` (${Math.round(data.confidence * 100)}%)` : ''
        const label = MODE_LABELS[data.mode ?? 'single'] ?? '⚡ Auto'
        addSystem(`${label} → ${prov} won${conf}`)
      } else {
        const reply = await streamReply(hist, chatMode)
        onPushShared('assistant', reply, ai)
      }
    } catch (e) {
      const err = e as Error
      if (err.name === 'AbortError') { setLoading(false); return }
      setMsgs(p => {
        const last = p[p.length - 1]
        if (last?.streaming)
          return [...p.slice(0, -1), { ...last, streaming: false, content: last.content || `⚠️ ${err.message}` }]
        return [...p, { role: 'assistant', content: `⚠️ ${err.message}` }]
      })
    }
    setLoading(false); abortRef.current = null
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px'
  }
  const toggleMode = () => {
    const next = chatMode === 'auto' ? ai : 'auto'
    setChatMode(next)
    addSystem(next === 'auto'
      ? 'Auto mode ON — system picks best AI'
      : `Manual mode — always ${ai === 'gpt' ? 'GPT-4o' : 'Claude Sonnet'}`)
  }
  const toggleCtx = () => {
    const next = !ctxOn; setCtxOn(next)
    addSystem(next
      ? 'Shared context ON — this AI sees the other conversation'
      : 'Shared context OFF — isolated mode')
  }
  const stopStream = () => { abortRef.current?.abort(); setLoading(false) }

  const isAuto      = chatMode === 'auto'
  const isStreaming  = loading && msgs.some(m => m.streaming)
  const modeLabel   = isAuto ? '⚡ Auto' : ai === 'gpt' ? '⬤ GPT' : '⬤ Claude'
  const modelBadge  = ai === 'gpt' ? 'GPT-4o' : 'Sonnet 4'

  return (
    <div className={`chat-panel ${isDark ? 'chat-dark' : 'chat-light'} ${isOpen ? 'chat-open' : ''}`}>

      {/* ── Header ── */}
      <div className="chat-header">
        <button className="chat-back" onClick={() => { stopStream(); onClose() }} aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>

        <span className="chat-title">{ai === 'gpt' ? 'ChatGPT' : 'Claude'}</span>

        {/* Mode toggle (Auto / manual) */}
        <button
          className={`mode-btn ${isAuto ? 'mode-btn--auto' : ''}`}
          onClick={toggleMode}
          title={isAuto ? 'Switch to manual mode' : 'Switch to Auto mode'}
        >
          {modeLabel}
        </button>

        <span className="model-badge">{modelBadge}</span>

        {/* Switch to other AI — explicit target, never a toggle */}
        <button
          className={`switch-ai-btn ${isDark ? 'switch-ai-btn--dark' : 'switch-ai-btn--light'}`}
          onClick={() => { stopStream(); onClose(); onSwitchAI() }}
          title={`Switch to ${other === 'gpt' ? 'GPT-4o' : 'Claude'}`}
        >
          {otherLabel}
        </button>
      </div>

      {/* ── Shared context toggle ── */}
      <ContextToggle
        enabled={ctxOn}
        msgCount={sharedBuffer.length}
        onToggle={toggleCtx}
        theme={isDark ? 'dark' : 'light'}
      />

      {/* ── Messages ── */}
      <div className="chat-messages" ref={msgsRef}>
        {msgs.length === 0 && (
          <div className="chat-welcome">
            <div className="chat-welcome-icon">{ai === 'gpt' ? '◎' : '◈'}</div>
            <div className="chat-welcome-text">
              {ai === 'gpt' ? 'Чем могу помочь?' : 'Привет! Чем могу помочь?'}
            </div>
          </div>
        )}
        {msgs.map((m, i) => <Bubble key={i} msg={m} isDark={isDark} />)}

        {loading && chatMode === 'auto' && !msgs.some(m => m.streaming) && (
          <div className="chat-typing" aria-label="Thinking">
            <span /><span /><span />
          </div>
        )}
      </div>

      {/* ── Input ── */}
      <div className="chat-input-area">
        <div className="chat-input-wrap">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Сообщение..."
            rows={1}
            disabled={loading && !isStreaming}
            aria-label="Message"
          />
        </div>
        <button
          className="chat-send"
          onClick={isStreaming ? stopStream : handleSend}
          disabled={!isStreaming && (loading || !input.trim())}
          aria-label={isStreaming ? 'Stop' : 'Send'}
        >
          {isStreaming
            ? <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>
            : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
          }
        </button>
      </div>
    </div>
  )
}
