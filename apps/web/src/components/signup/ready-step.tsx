import { ArrivalBadge } from '@guestnote/ui/arrival-badge'
import { Card } from '@guestnote/ui/card'

export type ReadyLabels = Readonly<{
  title: string
  studio: string
  wedding: string
  team: string
  teamValue: string
  /** Already filled; absent while billing is off, when there is no trial to date. */
  trial?: string
  open: string
}>

type Props = {
  readonly labels: ReadyLabels
  readonly studioName: string
  /** The couple's name, or null when the wedding step was skipped. */
  readonly weddingName: string | null
  readonly homeHref: string
}

/**
 * Sign-up step "Ready" (spec 0005, step 7): what now exists, read back from the database rather
 * than carried through the URL, so a reload says the same thing. "Open Guestnote" is a plain
 * link, styled as the primary button: it is a navigation, and a `<button>` doing
 * `location.assign` would lose middle-click and the status-bar URL for nothing.
 */
export function ReadyStep({ labels, studioName, weddingName, homeHref }: Props) {
  const rows: [string, string][] = [
    [labels.studio, studioName],
    [labels.wedding, weddingName ?? '—'],
    [labels.team, labels.teamValue],
  ]
  return (
    <>
      <ArrivalBadge className="mb-4" />
      <h1 className="mb-6 text-2xl leading-tight font-semibold tracking-tight">{labels.title}</h1>

      <Card as="section" padding="none" className="mb-4">
        <dl className="divide-y divide-border text-sm">
          {rows.map(([term, value]) => (
            <div key={term} className="flex items-baseline justify-between gap-4 px-4 py-3">
              <dt className="text-muted-foreground">{term}</dt>
              <dd className="min-w-0 truncate text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {labels.trial && (
        <p className="mb-4 text-xs leading-relaxed text-muted-foreground">{labels.trial}</p>
      )}

      <a
        href={homeHref}
        className="inline-flex h-11 w-full items-center justify-center rounded-[var(--radius)] border border-transparent bg-[var(--gn-action,var(--primary))] text-sm font-semibold text-[color:var(--gn-action-fg,var(--primary-foreground))] transition-[filter] duration-300 hover:brightness-110"
      >
        {labels.open}
      </a>
    </>
  )
}
