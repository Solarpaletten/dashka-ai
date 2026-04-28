'use client'

import { useState, useRef, FormEvent } from 'react'

type State = 'idle' | 'loading' | 'success' | 'error'

interface Props {
  /** Where the form is rendered — used as a tag in analytics/logs */
  placement?: 'hero' | 'footer'
}

/** Fire-and-forget event tracker. Failures don't block the user. */
function track(event: 'hero_cta_click' | 'waitlist_submit') {
  fetch('/api/track', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ event }),
    keepalive: true,
  }).catch(() => { /* swallow */ })
}

export default function WaitlistForm({ placement = 'hero' }: Props) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<State>('idle')
  const [message, setMsg] = useState<string>('')

  // Hero CTA click is fired once per session per form-instance — we want
  // intent signal, not noise. The first focus or click on the input counts.
  const heroClickFired = useRef(false)

  function onHeroIntent() {
    if (placement !== 'hero' || heroClickFired.current) return
    heroClickFired.current = true
    track('hero_cta_click')
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!email.trim() || state === 'loading') return

    setState('loading')
    setMsg('')

    try {
      const res = await fetch('/api/send-email', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: email.trim(), source: placement }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setState('error')
        setMsg(data?.error || 'Something went wrong. Try again.')
        return
      }

      setState('success')
      setMsg("You're on the list. We'll be in touch.")
      setEmail('')
      track('waitlist_submit')
    } catch {
      setState('error')
      setMsg('Network error. Try again.')
    }
  }

  return (
    <form className="dl-form" onSubmit={onSubmit} noValidate>
      <div className="dl-form-row">
        <input
          type="email"
          className="dl-input"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onFocus={onHeroIntent}
          onClick={onHeroIntent}
          disabled={state === 'loading'}
          required
          aria-label="Email"
        />
        <button
          type="submit"
          className="dl-btn"
          onClick={onHeroIntent}
          disabled={state === 'loading' || !email.trim()}
        >
          {state === 'loading' ? 'Joining…' : 'Join waitlist'}
        </button>
      </div>

      {message && (
        <div
          className={`dl-form-msg dl-form-msg--${state}`}
          role={state === 'error' ? 'alert' : 'status'}
        >
          {message}
        </div>
      )}
    </form>
  )
}
