'use client'

import { type PointerEvent, type ReactNode, useRef } from 'react'

/**
 * A card that tilts toward the pointer, with a glare where the pointer is (homepage price card,
 * spec 0006 as revised 2026-09-28). Children marked `.mk-lift` float above the card in depth.
 * Pointer only: on touch it simply sits flat, and under `prefers-reduced-motion` it never moves.
 */

export function TiltCard({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    el.style.transform = `rotateY(${(x - 0.5) * 14}deg) rotateX(${(0.5 - y) * 12}deg)`
    el.style.setProperty('--gx', `${x * 100}%`)
    el.style.setProperty('--gy', `${y * 100}%`)
  }
  const leave = () => {
    if (ref.current) ref.current.style.transform = ''
  }
  return (
    <div className="mk-3d">
      <div
        ref={ref}
        onPointerMove={move}
        onPointerLeave={leave}
        className={`mk-tilt relative ${className}`}
      >
        {children}
        <span className="mk-tilt-glare" aria-hidden="true" />
      </div>
    </div>
  )
}
