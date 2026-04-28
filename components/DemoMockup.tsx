'use client'

import { useState } from 'react'

/**
 * Static visual mockup of the Dashka chat surface.
 * ChatOn-inspired layout: tab bar on top, sidebar with history,
 * conversation thread with a meaningful example dialog.
 *
 * Tabs are click-active (visual only, no underlying logic) — gives
 * the "almost working" feel without committing to multi-mode UI yet.
 */

type TabKey = 'chat' | 'image' | 'web' | 'docs' | 'upload'

const TABS: { key: TabKey; label: string; icon: JSX.Element }[] = [
  {
    key: 'chat',
    label: 'Chat',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    key: 'image',
    label: 'Image',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
      </svg>
    ),
  },
  {
    key: 'web',
    label: 'Web',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
    ),
  },
  {
    key: 'docs',
    label: 'Docs',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    ),
  },
  {
    key: 'upload',
    label: 'Upload',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    ),
  },
]

export default function DemoMockup() {
  const [active, setActive] = useState<TabKey>('chat')

  return (
    <div className="dl-mock">
      {/* ── Tab bar (clickable, visual-only) ─────────────────── */}
      <div className="dl-mock-tabs" role="tablist" aria-label="Dashka surfaces">
        {TABS.map(tab => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active === tab.key}
            className={`dl-mock-tab ${active === tab.key ? 'dl-mock-tab--active' : ''}`}
            onClick={() => setActive(tab.key)}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── Frame ─────────────────────────────────────────────── */}
      <div className="dl-mock-frame">
        <div className="dl-mock-body">
          {/* sidebar */}
          <aside className="dl-mock-side">
            <div className="dl-mock-side-head">
              <span className="dl-mock-logo-mark">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                </svg>
              </span>
              <span>Dashka</span>
              <span className="dl-mock-side-collapse" aria-hidden>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="9" y1="3" x2="9" y2="21" />
                </svg>
              </span>
            </div>

            <div className="dl-mock-side-item dl-mock-side-item--active">
              <span className="dl-mock-side-icon">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </span>
              New chat
            </div>
            <div className="dl-mock-side-item dl-mock-side-item--ghost">
              <span className="dl-mock-side-icon" aria-hidden>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                </svg>
              </span>
              Projects
            </div>

            <div className="dl-mock-side-divider" />

            <div className="dl-mock-side-label">This week</div>
            <div className="dl-mock-side-item dl-mock-side-item--history dl-mock-side-item--current">
              Business launch in Germany
            </div>
            <div className="dl-mock-side-item dl-mock-side-item--history">Q3 marketing strategy</div>
            <div className="dl-mock-side-item dl-mock-side-item--history">Pricing model for SaaS</div>
            <div className="dl-mock-side-item dl-mock-side-item--history">Team onboarding flow</div>

            <div className="dl-mock-side-label" style={{ marginTop: 14 }}>Last month</div>
            <div className="dl-mock-side-item dl-mock-side-item--history">Investor deck v2</div>
            <div className="dl-mock-side-item dl-mock-side-item--history">Hiring plan 2026</div>
          </aside>

          {/* conversation */}
          <main className="dl-mock-main">
            <div className="dl-mock-thread">
              {/* user message */}
              <div className="dl-mock-msg dl-mock-msg--user">
                <div className="dl-mock-bubble dl-mock-bubble--user">
                  Plan a business launch in Germany with €10k budget.
                  Skincare brand, online-first.
                </div>
              </div>

              {/* assistant message */}
              <div className="dl-mock-msg dl-mock-msg--ai">
                <div className="dl-mock-bubble dl-mock-bubble--ai">
                  <div className="dl-mock-line">
                    Here&apos;s a lean 90-day launch plan for a DE online skincare brand on €10k.
                  </div>

                  <div className="dl-mock-line dl-mock-line--label">Budget split</div>
                  <ul className="dl-mock-list">
                    <li>Product &amp; sampling — €3.5k</li>
                    <li>Brand &amp; site (Shopify + DE legal pages) — €2k</li>
                    <li>Paid acquisition (Meta + TikTok) — €3k</li>
                    <li>Reserve / contingency — €1.5k</li>
                  </ul>

                  <div className="dl-mock-line dl-mock-line--label">Timeline</div>
                  <ol className="dl-mock-list">
                    <li>Weeks 1–3 — supplier, samples, brand identity</li>
                    <li>Weeks 4–6 — site, Impressum, AGB, payments (Klarna, SEPA)</li>
                    <li>Weeks 7–9 — soft launch, 5–8 micro-influencers</li>
                    <li>Weeks 10–12 — paid scaling, retention loop</li>
                  </ol>

                  <div className="dl-mock-line dl-mock-line--label">Risks to watch</div>
                  <ul className="dl-mock-list">
                    <li>Cosmetics notification (CPNP) before any sale</li>
                    <li>VAT registration once you cross €22k turnover</li>
                    <li>Paid CAC on TikTok DE drifting above €18</li>
                  </ul>

                  {/* "smart" closing line — sells the workspace, not the chat */}
                  <div className="dl-mock-followup">
                    <span className="dl-mock-followup-icon" aria-hidden>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                      </svg>
                    </span>
                    <span>
                      I can turn this into a <strong>launch checklist</strong>, <strong>budget tracker</strong>, or <strong>project board</strong>.
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* composer */}
            <div className="dl-mock-composer">
              <div className="dl-mock-composer-input">
                <span>Ask Dashka anything…</span>
              </div>
              <div className="dl-mock-composer-row">
                <div className="dl-mock-composer-tools">
                  <span className="dl-mock-composer-tool" aria-hidden>+</span>
                  <span className="dl-mock-composer-tool" aria-hidden>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                    </svg>
                  </span>
                  <span className="dl-mock-composer-tool" aria-hidden>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                  </span>
                </div>
                <div className="dl-mock-composer-right">
                  <span className="dl-mock-model">Claude · GPT-4o ▾</span>
                  <span className="dl-mock-send" aria-hidden>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </span>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
