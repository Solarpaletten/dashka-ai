'use client'

import { useState, useRef, useCallback, useEffect, MutableRefObject } from 'react'

interface Props {
  left:  React.ReactNode
  right: React.ReactNode
  onIdxChange?: (idx: number) => void
  goToRef?: MutableRefObject<(idx: number) => void>  // expose goTo to parent
}

const SNAP_RATIO = 0.20
const FLICK_VEL  = 0.30
const TAP_ZONE   = 50
const EASE       = 'transform .42s cubic-bezier(.32,.72,0,1)'

export default function Swipe({ left, right, onIdxChange, goToRef }: Props) {
  const [idx, setIdx]     = useState(0)
  const trackRef          = useRef<HTMLDivElement>(null)
  const startX            = useRef(0)
  const startY            = useRef(0)
  const startT            = useRef(0)
  const curX              = useRef(0)
  const dragging          = useRef(false)
  const isScrolling       = useRef<boolean | null>(null)

  const vw = () => window.innerWidth

  const translate = useCallback((x: number, animated: boolean) => {
    const el = trackRef.current
    if (!el) return
    el.style.transition = animated ? EASE : 'none'
    el.style.transform  = `translateX(${x}px)`
  }, [])

  const clamp = useCallback((base: number, dx: number): number => {
    const raw = base + dx
    if (raw > 0)      return raw * 0.25
    if (raw < -vw())  return -vw() + (raw + vw()) * 0.25
    return raw
  }, [])

  const goTo = useCallback((i: number, animated = true) => {
    const clamped = Math.max(0, Math.min(1, i))
    setIdx(clamped)
    translate(-clamped * vw(), animated)
    onIdxChange?.(clamped)
  }, [translate, onIdxChange])

  // Expose goTo to parent via ref
  useEffect(() => {
    if (goToRef) goToRef.current = goTo
  }, [goTo, goToRef])

  const resolve = useCallback((dx: number, dt: number, currentIdx: number) => {
    const vel   = dx / Math.max(dt, 1)
    const far   = Math.abs(dx) > vw() * SNAP_RATIO
    const flick = Math.abs(vel) > FLICK_VEL
    if ((far || flick) && dx < 0 && currentIdx < 1) goTo(1)
    else if ((far || flick) && dx > 0 && currentIdx > 0) goTo(0)
    else goTo(currentIdx)
  }, [goTo])

  // ── Touch ──────────────────────────────────────────────────────────
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0]
    startX.current   = t.clientX
    startY.current   = t.clientY
    startT.current   = Date.now()
    dragging.current = true
    isScrolling.current = null
    curX.current     = 0
    translate(-idx * vw(), false)
  }, [idx, translate])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragging.current) return
    const dx = e.touches[0].clientX - startX.current
    const dy = e.touches[0].clientY - startY.current
    if (isScrolling.current === null && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      isScrolling.current = Math.abs(dy) > Math.abs(dx)
    }
    if (isScrolling.current) return
    e.preventDefault()
    curX.current = dx
    translate(clamp(-idx * vw(), dx), false)
  }, [idx, translate, clamp])

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!dragging.current) return
    dragging.current = false
    if (isScrolling.current) { isScrolling.current = null; return }
    isScrolling.current = null
    const dt = Date.now() - startT.current
    const dx = curX.current; curX.current = 0
    if (Math.abs(dx) < 8 && dt < 250) {
      const tx = e.changedTouches[0].clientX
      if (tx < TAP_ZONE && idx > 0)           goTo(0)
      else if (tx > vw() - TAP_ZONE && idx < 1) goTo(1)
      else goTo(idx)
      return
    }
    resolve(dx, dt, idx)
  }, [idx, goTo, resolve])

  // ── Mouse ──────────────────────────────────────────────────────────
  useEffect(() => {
    let md = false
    const getIdx = () => idx
    const onDown = (e: MouseEvent) => {
      md = true; startX.current = e.clientX; startT.current = Date.now()
      curX.current = 0; translate(-getIdx() * vw(), false)
    }
    const onMove = (e: MouseEvent) => {
      if (!md) return
      curX.current = e.clientX - startX.current
      translate(clamp(-getIdx() * vw(), curX.current), false)
    }
    const onUp = (e: MouseEvent) => {
      if (!md) return; md = false
      const dt = Date.now() - startT.current
      const dx = curX.current; curX.current = 0
      if (Math.abs(dx) < 8 && dt < 250) {
        if (e.clientX < TAP_ZONE && getIdx() > 0)           goTo(0)
        else if (e.clientX > vw() - TAP_ZONE && getIdx() < 1) goTo(1)
        else goTo(getIdx())
      } else resolve(dx, dt, getIdx())
    }
    const track = trackRef.current
    track?.addEventListener('mousedown', onDown)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      track?.removeEventListener('mousedown', onDown)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [idx, translate, clamp, goTo, resolve])

  useEffect(() => {
    const onResize = () => translate(-idx * vw(), false)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [idx, translate])

  return (
    <div className="swipe-shell">
      <div
        ref={trackRef}
        className="swipe-track"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="swipe-screen">{left}</div>
        <div className="swipe-screen">{right}</div>
      </div>

      <div className="switcher" role="tablist">
        <button
          role="tab" aria-selected={idx === 0}
          className={`sw-pill ${idx === 0 ? 'sw-pill--gpt sw-pill--active' : ''}`}
          onClick={() => goTo(0)}
        >← GPT</button>
        <div className="sw-divider" aria-hidden />
        <div className="sw-center" aria-hidden>
          <div className="sw-dots">
            <div className={`sw-dot sw-dot--gpt    ${idx === 0 ? 'sw-dot--lit' : ''}`} />
            <div className={`sw-dot sw-dot--claude ${idx === 1 ? 'sw-dot--lit' : ''}`} />
          </div>
          <div className="sw-label">AI</div>
        </div>
        <div className="sw-divider" aria-hidden />
        <button
          role="tab" aria-selected={idx === 1}
          className={`sw-pill ${idx === 1 ? 'sw-pill--claude sw-pill--active' : ''}`}
          onClick={() => goTo(1)}
        >Claude →</button>
      </div>
    </div>
  )
}
