'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Real chat surface. Stage 1: shows the user's first prompt and an
 * immediate Dashka response. The response is the same structured plan
 * we use in the landing's DemoMockup — taken verbatim so the value
 * we promise on `/` is the value we deliver on `/chat`.
 *
 * No backend yet. Sending another message just echoes a short stub.
 * That's the next sprint.
 */

type Role = 'user' | 'dashka'

interface BaseMsg {
  id:   string
  role: Role
}

interface PlainMsg extends BaseMsg {
  kind: 'plain'
  text: string
}

interface RichMsg extends BaseMsg {
  kind:   'rich'
  blocks: RichBlock[]
}

type RichBlock =
  | { kind: 'p';  text: string }
  | { kind: 'h';  text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'followup'; text: string; highlights: string[] }

type Msg = PlainMsg | RichMsg

/** Build the canonical "launch plan" reply. Keeps UI dumb, content authored. */
function buildLaunchPlanReply(): RichMsg {
  return {
    id: 'r-launch-plan',
    role: 'dashka',
    kind: 'rich',
    blocks: [
      { kind: 'p',  text: "Here's a lean 90-day launch plan for a DE online skincare brand on €10k." },
      { kind: 'h',  text: 'Budget split' },
      { kind: 'ul', items: [
        'Product & sampling — €3.5k',
        'Brand & site (Shopify + DE legal pages) — €2k',
        'Paid acquisition (Meta + TikTok) — €3k',
        'Reserve / contingency — €1.5k',
      ]},
      { kind: 'h',  text: 'Timeline' },
      { kind: 'ol', items: [
        'Weeks 1–3 — supplier, samples, brand identity',
        'Weeks 4–6 — site, Impressum, AGB, payments (Klarna, SEPA)',
        'Weeks 7–9 — soft launch, 5–8 micro-influencers',
        'Weeks 10–12 — paid scaling, retention loop',
      ]},
      { kind: 'h',  text: 'Risks to watch' },
      { kind: 'ul', items: [
        'Cosmetics notification (CPNP) before any sale',
        'VAT registration once you cross €22k turnover',
        'Paid CAC on TikTok DE drifting above €18',
      ]},
      {
        kind: 'followup',
        text: 'I can turn this into a {0}, {1}, or {2}.',
        highlights: ['launch checklist', 'budget tracker', 'project board'],
      },
    ],
  }
}

/**
 * Live-feeling stand-in for the second message and beyond.
 * No real AI yet. Three layers, ordered:
 *   1. Keyword clarifiers — if the user mentions a recognisable noun
 *      (purchase, plan, landing, business, week, …), respond with a
 *      narrowing question. Recognised in EN + RU.
 *   2. Generic intent buckets (questions, build-something, organize-…).
 *   3. Universal fallback — open-ended invitations.
 *
 * Anti-repeat: never returns the exact line that was just sent.
 */

interface ReplyContext {
  /** The text of the assistant's previous reply, if any. */
  lastReply?: string
}

function buildShortReply(seed: string, ctx: ReplyContext = {}): PlainMsg {
  const lower = seed.toLowerCase()

  // ── Layer 1: keyword clarifiers (most specific wins) ────────────
  // Each entry: a regex tested against the lower-cased input + 2–3 clarifiers.
  // Ordered by specificity — first match wins.
  const KEYWORD_CLARIFIERS: { match: RegExp; replies: string[] }[] = [
    {
      match: /\b(purchase|purchas|buy|buying|order)\b|покуп|приобр|купить/u,
      replies: [
        'Got it — is this for a product, a company, or something personal?',
        'Sure. Is this a one-off purchase or something recurring?',
      ],
    },
    {
      match: /\blanding\b|лендинг|посадочн/u,
      replies: [
        'Is this for a product, a company, or a single campaign?',
        'A landing page — got it. Do you already have a name and audience in mind?',
      ],
    },
    {
      match: /\b(business|startup|company|brand)\b|бизнес|компани|стартап|бренд/u,
      replies: [
        'What stage is it at — idea, early traction, or already running?',
        'What kind of business are we shaping — product, service, or marketplace?',
      ],
    },
    {
      match: /\b(plan|roadmap|strategy)\b|план|стратеги|дорожн/u,
      replies: [
        'What kind of plan are you thinking about — a launch, a quarter, or a year?',
        "Happy to plan with you. What's the timeframe — weeks or months?",
      ],
    },
    {
      match: /\b(week|day|today|tomorrow|schedule)\b|недел|расписан|сегодня|завтра|день/u,
      replies: [
        "Let's shape the week. How many big things do you want to land?",
        "Got it. Is this about your time, the team's, or both?",
      ],
    },
    {
      match: /\b(content|article|post|blog|copy|email)\b|контент|стать|пост|email|письм/u,
      replies: [
        'What format and audience are we writing for?',
        'Got it — long-form, short post, or something for email?',
      ],
    },
    {
      match: /\b(code|app|feature|bug|api|prd|тз|ts)\b|код|приложен|фича|бага/u,
      replies: [
        'Sure — is this a new build or extending something that exists?',
        "Got it. Want to start from the spec or jump into the rough shape?",
      ],
    },
    {
      match: /\b(team|hiring|hire|onboard)\b|команд|найм|нанять|онбординг/u,
      replies: [
        'How big is the team today, and what role are we shaping for?',
        'Got it. Are we thinking process or specific roles first?',
      ],
    },
    {
      match: /\b(price|pricing|tariff|plan)\b|цена|цены|тариф|прайс/u,
      replies: [
        'Per-seat, usage-based, or flat tiers — any direction in mind?',
        "Got it. Who's the target buyer — individual, team, or enterprise?",
      ],
    },
  ]

  for (const entry of KEYWORD_CLARIFIERS) {
    if (entry.match.test(lower)) {
      return makeReply(pickFresh(entry.replies, ctx.lastReply, seed))
    }
  }

  // ── Layer 2: generic intent buckets ─────────────────────────────
  let pool: string[]

  if (/\b(why|what|how|when|where|who|which)\b/.test(lower) || lower.endsWith('?')
      || /\b(что|как|почему|когда|где|кто|какой|какая|зачем)\b/u.test(lower)) {
    pool = [
      'Good question — want me to go deeper on this?',
      'Let me think about it with you. Where would you like to start?',
      'There are a few angles here. Which one matters most to you?',
    ]
  } else if (/\b(build|start|create|make|design|write|draft|launch)\b/.test(lower)
          || /\b(сделать|создать|построить|написать|запустить|разработать)\b/u.test(lower)) {
    pool = [
      "Let's build this step by step. What's the first piece you want to lock in?",
      'I can sketch a structure for this — should we start from goals or constraints?',
      'Happy to take this on. Tell me one detail you already know about it.',
    ]
  } else if (/\b(organize|sort|prioritize|todo|tasks?)\b/.test(lower)
          || /\b(организовать|приоритет|задачи|дела|упорядочить)\b/u.test(lower)) {
    pool = [
      "Let's get this organized together. What's on your plate right now?",
      "I can help you shape this. What's the deadline we're working against?",
    ]
  } else {
    // ── Layer 3: universal fallback
    pool = [
      'Want me to go deeper on this?',
      "Let's build this step by step.",
      'Tell me a bit more — what would a great outcome look like for you?',
      "Got it. What's the next piece you want to figure out?",
      "Mm-hm, with you. Where do you want to take this next?",
    ]
  }

  return makeReply(pickFresh(pool, ctx.lastReply, seed))
}

/**
 * Pick a reply from the pool, deterministically by seed-hash, but never
 * return the exact line we just sent. Falls back to a rotated next pick.
 */
function pickFresh(pool: string[], lastReply: string | undefined, seed: string): string {
  if (pool.length === 0) return ''
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  const start = Math.abs(h) % pool.length
  for (let i = 0; i < pool.length; i++) {
    const candidate = pool[(start + i) % pool.length]
    if (candidate !== lastReply) return candidate
  }
  // All identical to lastReply (shouldn't happen) — return first anyway.
  return pool[0]
}

function makeReply(text: string): PlainMsg {
  return {
    id:   `r-${Date.now()}`,
    role: 'dashka',
    kind: 'plain',
    text,
  }
}

interface Props {
  initialPrompt?: string
}

export default function DashkaChat({ initialPrompt = '' }: Props) {
  const router = useRouter()
  const [input,    setInput]    = useState('')
  const [messages, setMessages] = useState<Msg[]>([])
  const [thinking, setThinking] = useState(false)

  const seededRef = useRef(false)
  const threadEnd = useRef<HTMLDivElement | null>(null)

  // ── Seed the thread once if we arrived with ?prompt=... ──────
  useEffect(() => {
    if (seededRef.current) return
    seededRef.current = true

    const prompt = initialPrompt.trim()
    if (!prompt) return

    const userMsg: PlainMsg = {
      id:   'u-initial',
      role: 'user',
      kind: 'plain',
      text: prompt,
    }
    setMessages([userMsg])

    // Brief "thinking" beat — feels like a product, not a redirect.
    setThinking(true)
    const t = setTimeout(() => {
      setMessages(prev => [...prev, buildLaunchPlanReply()])
      setThinking(false)
    }, 700)

    return () => clearTimeout(t)
  }, [initialPrompt])

  // Auto-scroll to bottom on each message
  useEffect(() => {
    threadEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, thinking])

  function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || thinking) return

    const userMsg: PlainMsg = {
      id:   `u-${Date.now()}`,
      role: 'user',
      kind: 'plain',
      text: trimmed,
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')

    setThinking(true)
    setTimeout(() => {
      setMessages(prev => {
        // Find the last Dashka reply for anti-repeat context
        const lastDashka = [...prev].reverse().find(m => m.role === 'dashka')
        const lastText =
          lastDashka && lastDashka.kind === 'plain' ? lastDashka.text : undefined
        return [...prev, buildShortReply(trimmed, { lastReply: lastText })]
      })
      setThinking(false)
    }, 600)
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  function onNewChat() {
    router.push('/workspace')
  }

  return (
    <div className="dc-root">
      {/* ── Top bar ─────────────────────────────────────── */}
      <header className="dc-top">
        <div className="dc-logo">
          <span className="dc-logo-mark" aria-hidden>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
          </span>
          <span className="dc-logo-text">Dashka</span>
        </div>

        <div className="dc-top-right">
          <button type="button" className="dc-new-btn" onClick={onNewChat}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
            New chat
          </button>
          <span className="dc-avatar" aria-hidden>D</span>
        </div>
      </header>

      {/* ── Thread ──────────────────────────────────────── */}
      <main className="dc-thread-wrap">
        <div className="dc-thread">
          {messages.length === 0 && !thinking && (
            <div className="dc-empty">
              <span className="dc-empty-mark" aria-hidden>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                </svg>
              </span>
              <p className="dc-empty-text">Ask Dashka anything to get started.</p>
            </div>
          )}

          {messages.map(msg => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}

          {thinking && (
            <div className="dc-msg dc-msg--dashka">
              <div className="dc-bubble dc-bubble--dashka dc-bubble--thinking">
                <span className="dc-dot" />
                <span className="dc-dot" />
                <span className="dc-dot" />
              </div>
            </div>
          )}

          <div ref={threadEnd} />
        </div>
      </main>

      {/* ── Composer ────────────────────────────────────── */}
      <div className="dc-composer-wrap">
        <div className="dc-composer">
          <textarea
            className="dc-textarea"
            placeholder="Ask Dashka anything…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            aria-label="Message"
          />
          <button
            type="button"
            className="dc-send"
            onClick={() => send(input)}
            disabled={!input.trim() || thinking}
            aria-label="Send"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
        <p className="dc-composer-hint">
          <kbd className="dc-kbd">Enter</kbd> to send · <kbd className="dc-kbd">Shift</kbd>+<kbd className="dc-kbd">Enter</kbd> for newline
        </p>
      </div>
    </div>
  )
}

/* ── Message rendering ─────────────────────────────────── */

function MessageBubble({ msg }: { msg: Msg }) {
  const sideClass = msg.role === 'user' ? 'dc-msg--user' : 'dc-msg--dashka'
  const bubbleClass = msg.role === 'user' ? 'dc-bubble--user' : 'dc-bubble--dashka'

  return (
    <div className={`dc-msg ${sideClass}`}>
      {msg.role === 'dashka' && (
        <span className="dc-msg-avatar" aria-hidden>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
        </span>
      )}

      <div className={`dc-bubble ${bubbleClass}`}>
        {msg.kind === 'plain' ? (
          <p className="dc-line">{msg.text}</p>
        ) : (
          msg.blocks.map((b, i) => <RichBlockView key={i} block={b} />)
        )}
      </div>
    </div>
  )
}

function RichBlockView({ block }: { block: RichBlock }) {
  switch (block.kind) {
    case 'p':
      return <p className="dc-line">{block.text}</p>
    case 'h':
      return <p className="dc-line dc-line--label">{block.text}</p>
    case 'ul':
      return (
        <ul className="dc-list">
          {block.items.map((it, i) => <li key={i}>{it}</li>)}
        </ul>
      )
    case 'ol':
      return (
        <ol className="dc-list">
          {block.items.map((it, i) => <li key={i}>{it}</li>)}
        </ol>
      )
    case 'followup':
      // text contains {0}, {1}, {2} placeholders for highlighted segments.
      return (
        <div className="dc-followup">
          <span className="dc-followup-icon" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </span>
          <span>
            {renderFollowup(block.text, block.highlights)}
          </span>
        </div>
      )
  }
}

function renderFollowup(template: string, highlights: string[]) {
  // Split on {N} placeholders, interleave with <strong>.
  const parts = template.split(/(\{\d+\})/g)
  return parts.map((part, i) => {
    const m = part.match(/^\{(\d+)\}$/)
    if (m) {
      const idx = Number(m[1])
      return <strong key={i}>{highlights[idx] ?? ''}</strong>
    }
    return <span key={i}>{part}</span>
  })
}
