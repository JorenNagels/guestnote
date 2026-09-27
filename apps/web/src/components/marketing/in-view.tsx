'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'

/**
 * The one piece of JavaScript behind the mini-UI animations (spec 0006, "Product visuals"): it
 * flips `data-inview` from `false` to `true` the first time its box scrolls into view, and never
 * back. Everything that moves is CSS keyed off that attribute in `marketing.css`.
 *
 * Once, not on every entry: a checklist that un-ticks itself as you scroll back up reads as a
 * bug. `threshold: 0.35` so the motion starts when the reader can see it, not when one pixel has
 * crossed the fold.
 *
 * The hidden start states apply only under `.mk-js`, which the marketing layout sets with an
 * inline script before first paint -- so the server HTML, a crawler and a browser without
 * JavaScript all get the final frame. Where IntersectionObserver does not exist, it shows the
 * final frame at once rather than keeping the content hidden forever.
 */
export function InView({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(false)

  useEffect(() => {
    // Tells the layout's JS_FLAG fallback that hydration happened, so it keeps the flag.
    ;(window as Window & { __mkInView?: boolean }).__mkInView = true
    const node = ref.current
    if (!node) return
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true)
          observer.disconnect()
        }
      },
      { threshold: 0.35 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} data-inview={seen ? 'true' : 'false'} className={className}>
      {children}
    </div>
  )
}
