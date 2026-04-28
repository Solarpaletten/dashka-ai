'use client'

import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react'

interface Props {
  as?:        ElementType
  id?:        string
  className?: string
  children:   ReactNode
}

/**
 * Minimal scroll-triggered fade-in via IntersectionObserver.
 * Only adds a `dl-fade-in` + `dl-fade-in--visible` class — the actual
 * animation lives in landing.css and respects prefers-reduced-motion.
 *
 * No dependencies, no animation library — kept deliberately small.
 */
export default function FadeIn({ as: Tag = 'section', id, className = '', children }: Props) {
  const ref = useRef<HTMLElement | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // SSR-safe; if IO is missing we just stay visible.
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }

    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true)
            obs.disconnect()
            break
          }
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.05 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const cls = `${className} dl-fade-in ${visible ? 'dl-fade-in--visible' : ''}`.trim()

  return (
    <Tag ref={ref} id={id} className={cls}>
      {children}
    </Tag>
  )
}
