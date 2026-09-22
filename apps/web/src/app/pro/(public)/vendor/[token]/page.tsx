import { getVendorLinkView, resolveVendorLinkByHash } from '@guestnote/db'
import { getLocale, getTranslations } from 'next-intl/server'
import { formatCivilDate } from '../../../../../components/wedding/wedding-header.tsx'
import { getDb } from '../../../../../lib/db.ts'
import { splitDuration } from '../../../../../lib/run-sheet.ts'
import { hashVendorLinkToken } from '../../../../../lib/vendor-link-token.ts'

/**
 * `app.guestnote.be/vendor/<token>` -- spec 0003, S10. The one screen a vendor with no
 * account ever sees: their own slice of one wedding's run sheet, and what the planner needs
 * from them, resolved through a `link` `Principal` (migration 0008) rather than a session.
 *
 * ## Why one function decides everything, unlike `/invite/[token]`
 *
 * `/invite/[token]` has five outcomes because accepting an invitation is a multi-step flow
 * with a session in the middle. A vendor link has exactly two: `resolve_vendor_link`
 * returned a live link, or it did not -- there is no sign-in step to cross, no address to
 * compare, nothing to spend. So this page has one `if`, not a `switch`.
 *
 * ## "Never a leak of why" (spec 0003)
 *
 * `resolveVendorLinkByHash` DOES tell this file apart an unknown token from an expired one
 * from a revoked one (`VendorLinkLookup.status`), for a future admin view. This page reads
 * that field and then deliberately throws it away: `status !== 'live'` renders the identical
 * `gone` copy regardless of which of the three it was, the same reasoning `/invite/[token]`
 * gives for treating "guessed", "truncated" and "purged" as one message.
 */
export default async function VendorLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const [{ token }, t, locale] = await Promise.all([
    params,
    getTranslations('app.s10'),
    getLocale(),
  ])

  const lookup = await resolveVendorLinkByHash(getDb(), hashVendorLinkToken(token))
  if (lookup?.status !== 'live') {
    return <Gone title={t('gone.title')} body={t('gone.body')} />
  }

  const view = await getVendorLinkView(getDb(), {
    kind: 'link',
    orgId: lookup.orgId,
    weddingId: lookup.weddingId,
    weddingVendorId: lookup.weddingVendorId,
  })

  const details = [
    lookup.weddingCoupleDisplayName,
    lookup.weddingDate ? formatCivilDate(locale, lookup.weddingDate) : null,
    lookup.weddingVenue,
  ].filter((v): v is string => Boolean(v))

  return (
    <div className="min-h-dvh bg-muted/40 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <p className="text-muted-foreground mb-4 text-sm">
          {t('sharedWith', { org: lookup.orgName })}
        </p>

        <div className="border-border bg-background rounded-[var(--radius)] border p-6">
          <p className="text-muted-foreground text-xs font-semibold tracking-[0.09em] uppercase">
            {t('sliceOfDay')}
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">{lookup.vendorName}</h1>
          {details.length > 0 && (
            <p className="text-muted-foreground mt-1.5 text-sm">{details.join(' · ')}</p>
          )}

          {lookup.weddingHeadcount !== null && (
            <dl className="border-border mt-5 grid grid-cols-2 gap-3.5 border-t pt-4 sm:grid-cols-4">
              <div>
                <dt className="text-muted-foreground text-xs font-semibold tracking-[0.08em] uppercase">
                  {t('headcount')}
                </dt>
                <dd className="mt-1 font-mono text-lg font-semibold tabular-nums">
                  {lookup.weddingHeadcount}
                </dd>
              </div>
            </dl>
          )}
        </div>

        <section className="mt-5">
          <h2 className="mb-2 text-sm font-semibold tracking-tight">{t('timelineTitle')}</h2>
          <div className="border-border bg-background overflow-hidden rounded-[var(--radius)] border">
            {view.timeline.length === 0 ? (
              <p className="text-muted-foreground p-4 text-sm">{t('timelineEmpty')}</p>
            ) : (
              view.timeline.map((item, i) => (
                <div
                  key={item.id}
                  className={`flex gap-3.5 p-3.5 ${i > 0 ? 'border-border border-t' : ''}`}
                >
                  <span className="w-14 flex-none text-right font-mono text-sm font-semibold tabular-nums">
                    {item.startsAt}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{item.title}</p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {[item.eventLabel, formatDuration(item.durationMin, t), item.place]
                        .filter((v): v is string => Boolean(v))
                        .join(' · ')}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {view.plannerNote && (
          <section className="mt-5">
            <h2 className="mb-2 text-sm font-semibold tracking-tight">{t('plannerNeedsTitle')}</h2>
            <div className="border-border bg-background rounded-[var(--radius)] border p-4">
              <p className="text-sm whitespace-pre-wrap">{view.plannerNote}</p>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

/** "45 min", "1 h" or "1 h 30" -- same three-shape reading `run-sheet-view.tsx` uses. */
function formatDuration(minutes: number, t: Awaited<ReturnType<typeof getTranslations>>): string {
  const { h, m } = splitDuration(minutes)
  if (h > 0 && m > 0) return t('hoursMinutes', { h, m })
  if (h > 0) return t('hours', { h })
  return t('minutes', { m })
}

/** The one outcome that is not the vendor's own data: unknown, expired or revoked, all alike. */
function Gone({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/40 px-4">
      <div className="border-border bg-background max-w-sm rounded-[var(--radius)] border p-6 text-center">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-2 text-sm">{body}</p>
      </div>
    </div>
  )
}
