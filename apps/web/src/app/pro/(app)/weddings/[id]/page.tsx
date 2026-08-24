import { getWedding } from '@guestnote/db'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { getDb } from '../../../../../lib/db.ts'
import { currentMemberships, currentOrgId } from '../../../../../lib/principal.ts'

/**
 * One wedding. Name, date, status -- and that is the whole screen, on purpose.
 *
 * It exists because the ⌘K palette needs somewhere to land. `docs/specs/0001` records the
 * trade: "jump to any wedding by typing" is the palette's entire value, and a palette that
 * lists weddings and then drops you back on the list teaches a planner not to trust it. So
 * the scope widened by one page rather than shipping a jump that does not arrive.
 *
 * The sections a wedding will really have -- tasks, guests, budget, the run sheet -- are
 * not here and are not stubbed. `tasks` is the only one with a table, and it arrives with
 * the feature that builds its screen.
 *
 * ## `null` is a 404, and never a 403
 *
 * `getWedding` returns `null` for three different situations: no such wedding, a wedding in
 * another organisation, and a wedding in this organisation that a `member` is not assigned
 * to. They are deliberately indistinguishable from here, and `notFound()` is what keeps
 * them that way. research/07 section 3's permission table ends "neither -> 404 (not 403 --
 * don't confirm the wedding exists)": telling somebody a wedding exists but is not theirs
 * is itself the leak.
 */
export default async function WeddingPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, memberships, orgId, t, locale] = await Promise.all([
    params,
    currentMemberships(),
    currentOrgId(),
    getTranslations('app'),
    getLocale(),
  ])

  if (!memberships || !orgId) notFound()

  const wedding = await getWedding(getDb(), memberships, orgId, id)
  if (!wedding) notFound()

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header>
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.09em] uppercase">
          {t('nav.weddingSection')}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{wedding.coupleDisplayName}</h1>
      </header>

      <dl className="divide-border bg-card mt-7 divide-y overflow-hidden rounded-[var(--radius)] border">
        <Row label={t('wedding.date')}>
          {/* Formatted in UTC, which looks wrong and is not: `weddings.wedding_date` is a
              `date`, and the schema says why -- a wedding date is a local civil date, the
              same date to the couple whether they are in Brussels or Bali. Drizzle hands
              back `YYYY-MM-DD`, `new Date()` reads it as UTC midnight, and formatting in a
              zone west of Greenwich would render the day before. */}
          {wedding.weddingDate ? (
            <time dateTime={wedding.weddingDate} className="tabular-nums">
              {new Intl.DateTimeFormat(locale, {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                timeZone: 'UTC',
              }).format(new Date(wedding.weddingDate))}
            </time>
          ) : (
            <span className="text-muted-foreground">{t('weddings.dateUnknown')}</span>
          )}
        </Row>
        <Row label={t('wedding.status')}>{t(`weddings.status.${wedding.status}`)}</Row>
        <Row label="Slug">
          <span className="font-mono text-xs">{wedding.slug}</span>
        </Row>
      </dl>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 px-4 py-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right">{children}</dd>
    </div>
  )
}
