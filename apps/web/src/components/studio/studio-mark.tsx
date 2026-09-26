'use client'

import { cx } from '@guestnote/ui/cx'
import { useState } from 'react'
import { Monogram } from '../nav/monogram.tsx'

/**
 * A studio's logo where it has one, its monogram where it does not -- and the monogram again
 * when the logo fails to load (spec 0005, "Logo"). The sidebar's org chip, open and collapsed,
 * and the vendor-link page header.
 *
 * A failed load is expected, not exotic: the URL is a 5 minute signature, so a tab left open
 * past it draws a broken image on its next re-render, and a deleted object answers 404. The
 * failure is remembered per URL rather than as a flag, so a fresh render's fresh signature gets
 * its own attempt.
 *
 * `alt=""` because the studio's name is always beside it (or visually-hidden text on the rail)
 * -- the reason the monogram is `aria-hidden`. White behind it and `object-contain`: a logo is
 * drawn for a light page, and a transparent PNG on the dark theme's surface can vanish.
 */
export function StudioMark({
  name,
  logoUrl,
  className,
}: {
  name: string
  logoUrl?: string | null | undefined
  /** Size overrides; both the image and the monogram take it. Defaults to 28px. */
  className?: string | undefined
}) {
  const [failed, setFailed] = useState<string | null>(null)
  if (!logoUrl || failed === logoUrl) return <Monogram name={name} className={className} />
  return (
    // biome-ignore lint/performance/noImgElement: a presigned, per-render URL -- next/image would proxy and cache a credential
    <img
      src={logoUrl}
      alt=""
      data-testid="studio-logo"
      onError={() => setFailed(logoUrl)}
      className={cx(
        'border-border size-7 shrink-0 rounded-[calc(var(--radius)-2px)] border bg-white object-contain',
        className,
      )}
    />
  )
}
