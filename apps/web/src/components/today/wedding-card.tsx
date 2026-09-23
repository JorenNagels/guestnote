import type { WeddingSummary } from '@guestnote/db'
import Link from 'next/link'
import { getFormatter, getLocale, getTranslations } from 'next-intl/server'
import { app } from '../../lib/routes.ts'
import { daysUntil, formatTMinus } from '../../lib/tminus.ts'
import { formatDate } from '../tasks/format.ts'
import type { WeddingLoad } from './sections.ts'

/**
 * One wedding on the Today screen: dot, couple, date, the countdown and the user's own load.
 *
 * The countdown is computed on the server here, where the sidebar computes it in the browser
 * (`nav/wedding-row.tsx` explains why that one must be client-side: it is in a layout that is
 * cached across days). This is a page rendered per request, so the arithmetic can sit beside the
 * data. `lib/tminus.ts` is the same function either way, so the two cannot disagree about the day.
 *
 * The colour is a dot and nothing more, and it is `aria-hidden`, as everywhere (spec 0003).
 */
export async function WeddingCard({
  wedding,
  load,
}: {
  wedding: WeddingSummary
  load: WeddingLoad | undefined
}) {
  const [t, shell, format, locale] = await Promise.all([
    getTranslations('app.today'),
    getTranslations('app.shell'),
    getFormatter(),
    getLocale(),
  ])
  const days = daysUntil(wedding.weddingDate)

  const loadText = !load
    ? t('loadNone')
    : load.overdue > 0
      ? t('loadOverdue', { overdue: load.overdue, open: load.open })
      : t('load', { open: load.open })

  return (
    <Link
      href={app.wedding(wedding.id)}
      className="border-border bg-card hover:bg-muted/50 focus-visible:outline-ring block rounded-[var(--radius)] border px-3.5 py-3 focus-visible:outline-2 focus-visible:-outline-offset-2"
    >
      <span className="flex items-center gap-2">
        <span
          aria-hidden="true"
          data-testid="wedding-dot"
          style={wedding.color ? { backgroundColor: wedding.color } : undefined}
          className={`size-2.5 shrink-0 rounded-full ${wedding.color ? '' : 'bg-muted-foreground/40'}`}
        />
        <span className="min-w-0 truncate text-[0.85rem] font-semibold">
          {wedding.coupleDisplayName}
        </span>
      </span>
      <span className="text-muted-foreground mt-0.5 block text-[0.72rem]">
        {wedding.weddingDate ? (
          <time dateTime={wedding.weddingDate}>{formatDate(format, wedding.weddingDate)}</time>
        ) : (
          shell('nav.noDate')
        )}
      </span>
      <span className="border-border mt-3 flex items-baseline justify-between gap-2 border-t pt-2.5">
        <span className="font-mono text-[1.15rem] font-semibold tracking-tight tabular-nums">
          {days === null ? (
            <span aria-hidden="true">–</span>
          ) : (
            <>
              <span aria-hidden="true">{formatTMinus(days)}</span>
              <span className="sr-only">{countdownPhrase(days, locale, shell)}</span>
            </>
          )}
        </span>
        <span
          className={
            load && load.overdue > 0
              ? 'text-destructive text-[0.72rem]'
              : 'text-muted-foreground text-[0.72rem]'
          }
        >
          {loadText}
        </span>
      </span>
    </Link>
  )
}

/**
 * The spoken form of `T-42`. `PluralRules` chooses between the two templates, as in
 * `nav/wedding-row.tsx`: the shell's countdown strings are `{days}` templates, not ICU plurals,
 * because they cross into a client bundle there and an ICU runtime is not worth one choice.
 */
function countdownPhrase(
  days: number,
  locale: string,
  shell: Awaited<ReturnType<typeof getTranslations>>,
): string {
  if (days === 0) return shell('countdown.today')
  const one = new Intl.PluralRules(locale).select(Math.abs(days)) === 'one'
  const key = days > 0 ? (one ? 'untilOne' : 'untilOther') : one ? 'sinceOne' : 'sinceOther'
  return shell(`countdown.${key}`, { days: Math.abs(days) })
}
