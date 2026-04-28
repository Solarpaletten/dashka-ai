'use client'

import { useEffect } from 'react'

/**
 * The shared globals.css (used by /workspace) locks
 * `html, body { overflow: hidden; height: 100% }` for the swipe app.
 *
 * On the landing we want normal page scroll. Toggling a body class is
 * 100% stable across browsers (no `:has()` dependency) and only applies
 * while the landing route is mounted.
 */
export default function BodyClassToggle({ className }: { className: string }) {
  useEffect(() => {
    const body = document.body
    const html = document.documentElement
    body.classList.add(className)
    html.classList.add(className)
    return () => {
      body.classList.remove(className)
      html.classList.remove(className)
    }
  }, [className])

  return null
}
