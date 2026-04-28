'use client'

import { useState, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'

const SUGGESTIONS = [
  'Plan my business',
  'Create a landing page',
  'Organize my week',
] as const

export default function Welcome() {
  const router = useRouter()
  const [value, setValue] = useState('')

  /** Navigate to /chat — with a prompt if provided. */
  function goToChat(prompt?: string) {
    const trimmed = prompt?.trim()
    if (trimmed) {
      router.push(`/chat?prompt=${encodeURIComponent(trimmed)}`)
    } else {
      router.push('/chat')
    }
  }

  function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    goToChat(trimmed)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(value)
    }
  }

  function onSuggestion(text: string) {
    // Suggestion chip — go straight into the chat with the prompt baked in.
    goToChat(text)
  }

  function onStartChat() {
    goToChat()
  }

  function onCreateProject() {
    // Project flow not built yet — keep as a no-op stub so the button still feels alive.
    // (Will become a real flow in the next sprint.)
    console.log('[welcome] create a project (stub)')
  }

  return (
    <div className="dw-root">
      {/* ── Top bar ─────────────────────────────────────── */}
      <header className="dw-top">
        <div className="dw-logo">
          <span className="dw-logo-mark" aria-hidden>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
          </span>
          <span className="dw-logo-text">Dashka</span>
        </div>

        <div className="dw-top-right">
          <span className="dw-avatar" aria-hidden>D</span>
        </div>
      </header>

      {/* ── Center stage ────────────────────────────────── */}
      <main className="dw-stage">
        {/* Dashka's voice — what makes the screen feel "met", not "loaded" */}
        <div className="dw-meet">
          <div className="dw-meet-avatar" aria-hidden>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
          </div>
          <div className="dw-meet-text">
            <p className="dw-meet-line dw-meet-line--lead">
              Hi, I&apos;m <strong>Dashka</strong>.
            </p>
            <p className="dw-meet-line">
              I can help you think, build, and organize anything.
            </p>
            <p className="dw-meet-line dw-meet-line--prompt">
              What do you want to start with?
            </p>
          </div>
        </div>

        {/* Primary actions */}
        <div className="dw-cta-row">
          <button
            type="button"
            className="dw-btn dw-btn--primary"
            onClick={onStartChat}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Start a new chat
          </button>
          <button
            type="button"
            className="dw-btn dw-btn--ghost"
            onClick={onCreateProject}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
            </svg>
            Create a project
          </button>
        </div>

        {/* Input */}
        <div className="dw-input-wrap">
          <div className="dw-input-row">
            <input
              type="text"
              className="dw-input"
              placeholder="Ask Dashka anything…"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={onKeyDown}
              aria-label="Ask Dashka"
            />
            <button
              type="button"
              className="dw-send"
              onClick={() => send(value)}
              disabled={!value.trim()}
              aria-label="Send"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>

          {/* Suggestion chips */}
          <div className="dw-suggestions" role="list">
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                type="button"
                role="listitem"
                className="dw-chip"
                onClick={() => onSuggestion(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </main>

      {/* ── Quiet footer hint ──────────────────────────── */}
      <footer className="dw-footer">
        <span>Press <kbd className="dw-kbd">Enter</kbd> to send · <kbd className="dw-kbd">Shift</kbd>+<kbd className="dw-kbd">Enter</kbd> for newline</span>
      </footer>
    </div>
  )
}
