'use client'

import { cx } from '@guestnote/ui/cx'
import Link from 'next/link'
import { app } from '../../lib/routes.ts'
import { daysUntil, formatTMinus } from '../../lib/tminus.ts'

export type ShellWedding = {
  id: string
  name: string
  /** `YYYY-MM-DD`, a civil date. */
  date: string | null
  status: string
  /** `#RRGGBB` or null. Null until a planner picks one, and for every wedding before F1. */
  color: string | null
}

export type WeddingRowLabels = {
  noDate: string
  archived: string
  today: string
  /** `{days}` is replaced. Two forms, because plural rules are picked here, not by ICU. */
  untilOne: string
  untilOther: string
  sinceOne: string
  sinceOther: string
}

/**
 * The colour column is CHECKed to `^#[0-9A-F]{6}$` (spec 0003), and this holds the UI to the same
 * contract rather than trusting whatever a repo hands back. It is not an injection guard --
 * React writes a style object through the CSSOM, which refuses `red; background: url(...)` on its
 * own. The failure it does stop is quieter: a `transparent`, a CSS variable or a named colour
 * that the picker never produces would draw an invisible dot or a stripe that clashes with the
 * theme. Anything that is not a plain hex renders as no colour, not as a guess.
 */
const HEX = /^#[0-9A-Fa-f]{6}$/

export function safeColor(color: string | null): string | null {
  return color !== null && HEX.test(color) ? color : null
}

function initials(name: string): string {
  const words = name.split(/\s*[&+]\s*|\s+/).filter((w) => w.length > 0)
  return words
    .slice(0, 2)
    .map((w) => Array.from(w)[0]?.toUpperCase() ?? '')
    .join('')
}

function phrase(days: number, locale: string, labels: WeddingRowLabels): string {
  if (days === 0) return labels.today
  // `PluralRules` and not a message-format plural: the labels cross the server/client line as
  // plain strings, and pulling an ICU runtime into the sidebar for one `one`/`other` choice
  // would put it in every dashboard page's client bundle. All three locales here have exactly
  // those two categories for cardinals.
  const one = new Intl.PluralRules(locale).select(Math.abs(days)) === 'one'
  const template =
    days > 0
      ? one
        ? labels.untilOne
        : labels.untilOther
      : one
        ? labels.sinceOne
        : labels.sinceOther
  return template.replace('{days}', String(Math.abs(days)))
}

/**
 * One wedding in the sidebar: a colour dot, the couple's name, and `T-42 · 12 jun`.
 *
 * ## Colour is a dot and a stripe, never text and never behind text
 *
 * The colour is an arbitrary planner-chosen hex, so no contrast rule can be promised for text
 * on it or over it. It is therefore only ever a shape beside the text: a dot when expanded, a
 * 3px edge on the rail. The prototype tinted the active row's background and put white initials
 * on a coloured chip; both were dropped for exactly this. (The run sheet does tint rows since spec
 * 0004, but only as a 12% mix into the card, a ceiling that keeps contrast for any hex -- the
 * prototype's tint was the full colour, and white text on an arbitrary colour has no floor.) Cost: the active row is marked by the
 * neutral `bg-muted` and the stripe, so a very pale colour makes the stripe faint -- the text
 * and `aria-current` still carry the state.
 *
 * ## `aria-current="true"`, not `"page"`
 *
 * Inside a wedding the sub-items under this row mark the actual page. The row marks *where
 * you are* -- the wedding -- which is what `true` means; `page` on both would say two links are
 * the current page.
 *
 * ## The countdown is computed here, in the browser
 *
 * Not in the layout: a layout renders once per hard load and then persists across every
 * client navigation, so a tab left open over midnight would keep yesterday's number all day.
 * The cost is that the server render and the first client render can disagree for the instant
 * around midnight in Brussels, which `suppressHydrationWarning` on the one node accepts. The
 * arithmetic and its timezone argument are in `lib/tminus.ts`.
 */
export function WeddingRow({
  wedding,
  current,
  collapsed,
  locale,
  labels,
  onNavigate,
}: {
  wedding: ShellWedding
  current: boolean
  collapsed: boolean
  locale: string
  labels: WeddingRowLabels
  onNavigate?: () => void
}) {
  const color = safeColor(wedding.color)
  const archived = wedding.status === 'archived'
  const days = daysUntil(wedding.date)

  const shared = cx(
    'group relative flex items-center rounded-[var(--radius)] border-l-[3px] outline-none',
    'transition-colors focus-visible:outline-ring focus-visible:outline-2',
    current ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted/60',
  )

  // The stripe: the active row on the expanded sidebar, every row on the rail (where there is
  // no room for a dot beside a name).
  const stripe = color !== null && (current || collapsed) ? color : 'transparent'

  if (collapsed) {
    return (
      <Link
        href={app.wedding(wedding.id)}
        onClick={() => onNavigate?.()}
        aria-current={current ? 'true' : undefined}
        // The name moves onto the element for the same reason as in `NavItem`: a `title`
        // is not reachable by touch and is announced inconsistently.
        aria-label={wedding.name}
        title={wedding.name}
        style={{ borderLeftColor: stripe }}
        className={cx(shared, 'h-[calc(var(--control-h)+2px)] justify-center px-0')}
      >
        <span
          aria-hidden="true"
          className="bg-card grid size-6 place-items-center rounded-md font-mono text-[0.625rem] font-semibold"
        >
          {initials(wedding.name)}
        </span>
        {/* The name as content too, and not only as `aria-label`: the initials are
            `aria-hidden`, so without this the link has no content at all and lint (rightly)
            cannot tell it is named. `aria-label` still wins for the accessible name. */}
        <span className="sr-only">{wedding.name}</span>
      </Link>
    )
  }

  const short =
    days !== null && wedding.date !== null
      ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
          new Date(wedding.date),
        )
      : null

  return (
    <Link
      href={app.wedding(wedding.id)}
      onClick={() => onNavigate?.()}
      aria-current={current ? 'true' : undefined}
      style={{ borderLeftColor: stripe }}
      className={cx(shared, 'min-h-[calc(var(--control-h)+2px)] gap-2.5 py-1 pr-2.5 pl-[7px]')}
    >
      <span
        aria-hidden="true"
        className="bg-border size-2.5 shrink-0 rounded-[3px]"
        {...(color === null ? {} : { style: { backgroundColor: color } })}
      />
      <span className="min-w-0 flex-1">
        <span
          className={cx(
            'block truncate text-[0.84rem] leading-tight',
            current ? 'font-semibold' : 'font-medium',
            archived && 'text-muted-foreground',
          )}
        >
          {wedding.name}
        </span>
        <span
          suppressHydrationWarning
          className="text-muted-foreground mt-px block truncate font-mono text-[0.6875rem] leading-tight tabular-nums"
        >
          {/* Checked first: an archived wedding's countdown is not a countdown -- a year-old
              `T+400` beside a live one is noise, and the status word says what the planner
              needs. */}
          {archived ? (
            labels.archived
          ) : days === null || short === null ? (
            labels.noDate
          ) : (
            <>
              <span aria-hidden="true">{formatTMinus(days)}</span>
              <span className="sr-only">{phrase(days, locale, labels)}</span>
              {' · '}
              {short}
            </>
          )}
        </span>
      </span>
    </Link>
  )
}
