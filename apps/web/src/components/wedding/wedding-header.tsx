import type { WeddingDetail } from '@guestnote/db'
import { Pill, type PillTone } from '@guestnote/ui/pill'
import { getLocale, getTranslations } from 'next-intl/server'
import { formatCivilDate } from '../../lib/civil-date.ts'
import { daysUntil, formatTMinus } from '../../lib/tminus.ts'

/**
 * The top of every wedding screen: a colour dot, the couple, the date with its countdown, the
 * venue, the stage. Slices put `<WeddingTabs>` under it. It reads only the summary fields, so a
 * slice that has `getWedding` and not `getWeddingDetail` can still render it.
 *
 * The colour is a dot and nothing more (spec 0003: never text, never a ground behind text), so
 * an arbitrary hex needs no contrast check. It is `aria-hidden`: the couple's name is the
 * identity, the dot is recognition.
 */
const STATUS_TONE: Record<string, PillTone> = {
  draft: 'neutral',
  live: 'success',
  archived: 'neutral',
}

export async function WeddingHeader({
  wedding,
  eyebrow,
}: {
  wedding: Pick<WeddingDetail, 'coupleDisplayName' | 'weddingDate' | 'venue' | 'color' | 'status'>
  /** The screen's own name, above the couple; the overview passes none. */
  eyebrow?: string
}) {
  const [t, app, locale] = await Promise.all([
    getTranslations('app.weddingPages.header'),
    getTranslations('app.weddings.status'),
    getLocale(),
  ])
  const days = wedding.status === 'archived' ? null : daysUntil(wedding.weddingDate)

  return (
    <header>
      {eyebrow ? (
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.09em] uppercase">
          {eyebrow}
        </p>
      ) : null}
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          aria-hidden="true"
          data-testid="wedding-dot"
          style={wedding.color ? { backgroundColor: wedding.color } : undefined}
          className={`size-3 shrink-0 rounded-full ${wedding.color ? '' : 'bg-muted-foreground/40'}`}
        />
        <h1 className="text-2xl font-semibold tracking-tight">{wedding.coupleDisplayName}</h1>
        <Pill tone={STATUS_TONE[wedding.status] ?? 'neutral'}>{app(wedding.status)}</Pill>
      </div>
      <p className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-2 text-sm">
        {wedding.weddingDate ? (
          <>
            <time dateTime={wedding.weddingDate} className="tabular-nums">
              {formatCivilDate(locale, wedding.weddingDate)}
            </time>
            {days === null ? null : (
              <span className="font-mono text-xs tabular-nums">{formatTMinus(days)}</span>
            )}
          </>
        ) : (
          <span>{t('noDate')}</span>
        )}
        <span aria-hidden="true">·</span>
        <span>{wedding.venue ?? t('noVenue')}</span>
      </p>
    </header>
  )
}
