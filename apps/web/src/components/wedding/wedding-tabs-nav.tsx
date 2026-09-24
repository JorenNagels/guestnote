'use client'

import { useSelectedLayoutSegment } from 'next/navigation'
import { type WeddingTab, type WeddingTabLabels, WeddingTabsView } from './wedding-tabs-view.tsx'

/**
 * The tab strip as `weddings/[id]/layout.tsx` renders it: once, above every wedding screen, with
 * the current tab read from the URL on the client. It has to be client-side for the reason the
 * layout exists -- a layout is not re-rendered when you move between its pages, so a `current`
 * passed from the server would stay on whichever tab was opened first.
 *
 * `useSelectedLayoutSegment` and not a pathname regex: it is the segment directly below the
 * layout, already parsed, and `null` on the overview itself.
 */
const BY_SEGMENT: Readonly<Record<string, WeddingTab>> = {
  tasks: 'tasks',
  budget: 'budget',
  payments: 'payments',
  vendors: 'vendors',
  'run-sheet': 'runSheet',
  files: 'files',
  moodboard: 'moodboard',
  settings: 'settings',
}

export function tabForSegment(segment: string | null): WeddingTab {
  return segment === null ? 'overview' : (BY_SEGMENT[segment] ?? 'overview')
}

export function WeddingTabsNav({
  weddingId,
  labels,
  navLabel,
}: {
  weddingId: string
  labels: WeddingTabLabels
  navLabel: string
}) {
  const segment = useSelectedLayoutSegment()
  return (
    <WeddingTabsView
      weddingId={weddingId}
      current={tabForSegment(segment)}
      labels={labels}
      navLabel={navLabel}
    />
  )
}
