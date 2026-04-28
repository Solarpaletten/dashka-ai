'use client'

import Link from 'next/link'

import { useState, useCallback, useRef } from 'react'
import Swipe from '@/components/Swipe'
import Chat  from '@/components/Chat'

interface SharedMsg { role: string; content: string; source: string }

// ── GPT Sidebar ───────────────────────────────────────────────────────
function GPTSidebar({ onOpenChat, ctxCount }: { onOpenChat: () => void; ctxCount: number }) {
  return (
    <div className="sidebar sidebar--dark">
      <div className="sidebar-header">
        <div className="sidebar-search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8e8ea0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input type="text" placeholder="Поиск" />
        </div>
      </div>
      <div className="sidebar-scroll">
        <nav className="sidebar-nav">
          <div className="nav-item">{gptIcon()}<span>ChatGPT</span></div>
          <div className="nav-item">{imgIcon()}<span>Изображения</span></div>
          <div className="nav-item">{codeIcon()}<span>Codex</span></div>
          <div className="nav-item">{appsIcon()}<span>Приложения</span></div>
        </nav>
        <button className="open-chat-btn open-chat-btn--gpt" onClick={onOpenChat}>
          {chatIconSm()}&nbsp; Новый чат с ChatGPT
        </button>
        <Link href="/legal" className="open-chat-btn open-chat-btn--legal" style={{textDecoration:'none',display:'flex',alignItems:'center',gap:10,margin:'6px 20px',padding:'10px 16px',background:'rgba(124,106,247,.15)',border:'1px solid rgba(124,106,247,.25)',borderRadius:12,color:'#a99af7',fontSize:14,fontWeight:500}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          Solar Legal Style
        </Link>
        <div className="ctx-sidebar-badge ctx-sidebar-badge--gpt" onClick={onOpenChat}>
          <span className="ctx-pulse" />
          <span>Shared context</span>
          <span className="ctx-sidebar-count">{ctxCount} msg</span>
        </div>
        <div className="sidebar-divider" />
        <div className="sidebar-projects">
          <div className="nav-item">
            {plusIcon()}<span>Новый проект</span>
          </div>
          {['Solar AI Workspace (Core M…','SolarX MVP (Next.js + auth…','4pl_Customs Transit Legal S…'].map(n => (
            <div key={n} className="nav-item">{folderIcon()}<span className="nav-item-name">{n}</span></div>
          ))}
        </div>
      </div>
      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="avatar avatar--gpt">LE</div>
          <div>
            <div className="user-name">Leapold</div>
            <div className="user-sub">Личная учетная запись</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Claude Sidebar ────────────────────────────────────────────────────
function ClaudeSidebar({ onOpenChat, ctxCount }: { onOpenChat: () => void; ctxCount: number }) {
  return (
    <div className="sidebar sidebar--light">
      <div className="sidebar-header sidebar-header--claude">
        <span className="claude-logo">Claude</span>
        <button className="claude-new-btn" onClick={onOpenChat} aria-label="New chat">
          {plusIconSm()}
        </button>
      </div>
      <div className="sidebar-scroll">
        <nav className="sidebar-nav sidebar-nav--light">
          <div className="nav-item nav-item--light">{chatIcon()}<span>Chats</span></div>
          <div className="nav-item nav-item--light">{projectIcon()}<span>Projekte</span></div>
          <div className="nav-item nav-item--light">{artefaktIcon()}<span>Artefakte</span></div>
          <div className="nav-item nav-item--light">{codeNavIcon()}<span>Code</span></div>
        </nav>
        <button className="open-chat-btn open-chat-btn--claude" onClick={onOpenChat}>
          {chatIconSm()}&nbsp; Новый чат с Claude
        </button>
        <div className="ctx-sidebar-badge ctx-sidebar-badge--claude" onClick={onOpenChat}>
          <span className="ctx-pulse ctx-pulse--claude" />
          <span>Shared context</span>
          <span className="ctx-sidebar-count">{ctxCount} msg</span>
        </div>
        <div className="sidebar-section-label">Markiert</div>
        {['JavaScript and React Project De…','Bank Statement Import for April',
          'AI Task Delegation System Archi…','Online Accounting App Develop…'].map(n => (
          <div key={n} className="list-item list-item--bold">{n}</div>
        ))}
        <div className="sidebar-section-label">Zuletzt verwendet</div>
        {['SolarX: детская безопасная ци…','Создание кроссплатформенно…',
          'Протокол командной коммуни…','Supplier debt transfer and freig…'].map(n => (
          <div key={n} className="list-item">{n}</div>
        ))}
      </div>
      <div className="sidebar-footer sidebar-footer--light">
        <div className="sidebar-user">
          <div className="avatar avatar--claude">V</div>
          <span className="user-name">Victoria</span>
        </div>
      </div>
    </div>
  )
}

// ── Inline SVG icons ──────────────────────────────────────────────────
const ico = (d: string, size = 19) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d}/>
  </svg>
)
const gptIcon      = () => <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" style={{opacity:.85}}><path d="M22.28 9.82a5.98 5.98 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.51-2.9 6.07 6.07 0 0 0-10.8 2.97 5.98 5.98 0 0 0-3.99 2.9 6.05 6.05 0 0 0 .74 7.1 5.98 5.98 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.51 2.9A6.06 6.06 0 0 0 13.26 24a6.06 6.06 0 0 0 5.77-4.21 5.99 5.99 0 0 0 3.99-2.9 6.06 6.06 0 0 0-.74-7.07z"/></svg>
const imgIcon      = () => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
const codeIcon     = () => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
const appsIcon     = () => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="18" cy="18" r="2"/></svg>
const chatIcon     = () => ico("M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z")
const chatIconSm   = () => ico("M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z", 17)
const projectIcon  = () => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 12h18"/></svg>
const artefaktIcon = () => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="M6 8v8M18 8v8M8 6h8M8 18h8"/></svg>
const codeNavIcon  = () => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
const folderIcon   = () => ico("M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", 17)
const plusIcon     = () => ico("M12 5v14M5 12h14", 17)
const plusIconSm   = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>

// ── Main page ─────────────────────────────────────────────────────────
export default function HomePage() {
  const [gptOpen,    setGptOpen]    = useState(false)
  const [claudeOpen, setClaudeOpen] = useState(false)
  const [shared, setShared]         = useState<SharedMsg[]>([])

  // Ref exposed to Swipe so we can call goTo programmatically
  const swipeGoTo = useRef<(idx: number) => void>(() => {})

  const pushShared = useCallback((role: string, content: string, source: string) => {
    setShared(p => {
      const next = [...p, { role, content, source }]
      return next.length > 20 ? next.slice(-20) : next
    })
  }, [])

  // Switch from GPT chat → Claude panel
  const switchToClaudeAI = useCallback(() => {
    setGptOpen(false)
    swipeGoTo.current(1)          // navigate swipe to Claude
    setTimeout(() => setClaudeOpen(true), 450)
  }, [])

  // Switch from Claude chat → GPT panel
  const switchToGptAI = useCallback(() => {
    setClaudeOpen(false)
    swipeGoTo.current(0)          // navigate swipe to GPT
    setTimeout(() => setGptOpen(true), 450)
  }, [])

  return (
    <main className="app-shell">
      <Swipe
        onIdxChange={() => {}}   // Swipe notifies on swipe; goTo ref is set inside
        goToRef={swipeGoTo}
        left={
          <div className="screen-wrapper">
            <GPTSidebar onOpenChat={() => setGptOpen(true)} ctxCount={shared.length} />
            <Chat
              ai="gpt"
              isOpen={gptOpen}
              onClose={() => setGptOpen(false)}
              onSwitchAI={switchToClaudeAI}
              sharedBuffer={shared}
              onPushShared={pushShared}
            />
          </div>
        }
        right={
          <div className="screen-wrapper">
            <ClaudeSidebar onOpenChat={() => setClaudeOpen(true)} ctxCount={shared.length} />
            <Chat
              ai="claude"
              isOpen={claudeOpen}
              onClose={() => setClaudeOpen(false)}
              onSwitchAI={switchToGptAI}
              sharedBuffer={shared}
              onPushShared={pushShared}
            />
          </div>
        }
      />
    </main>
  )
}
