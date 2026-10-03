import { getVendorLinkView, resolveVendorLinkByHash } from '@guestnote/db'
import { getLocale, getTranslations } from 'next-intl/server'
import { StudioMark } from '../../../../../components/studio/studio-mark.tsx'
import { VendorBoards } from '../../../../../components/vendor-link/vendor-boards.tsx'
import { hashBearerToken } from '../../../../../lib/bearer-token.ts'
import { formatCivilDate } from '../../../../../lib/civil-date.ts'
import { getDb } from '../../../../../lib/db.ts'
import { formatDuration } from '../../../../../lib/run-sheet.ts'
import { logoUrl } from '../../../../../lib/studio-logo.ts'
import { vendorBoards } from '../../../../../lib/vendor-boards.ts'
import { boardFileOpen, boardImageDownload, refreshBoardImages } from './actions.ts'

/**
 * `app.guestnote.be/vendor/<token>` -- spec 0003, S10. The one screen a vendor with no
 * account ever sees: their own slice of one wedding's run sheet (or, spec 0007, the whole day
 * when the planner switched that on), the moodboards shared with them, and what the planner
 * needs from them, resolved through a `link` `Principal` (migration 0008) rather than a session.
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
    getTranslations('app.vendorLink'),
    getLocale(),
  ])

  const lookup = await resolveVendorLinkByHash(getDb(), hashBearerToken(token))
  if (lookup?.status !== 'live') {
    return <Gone title={t('gone.title')} body={t('gone.body')} />
  }

  // The studio's logo (spec 0005), signed with the org the lookup resolved -- the only org this
  // link can speak for -- and beside the view read, not after it. `logoUrl` refuses a key that
  // is not a brand object of that org, and answers `null` for none, which draws the monogram.
  // Spec 0007: the boards shared with this vendor, their images signed here for five minutes.
  // `VendorBoards` asks for fresh URLs through the token when they lapse.
  const [view, logo, boards] = await Promise.all([
    getVendorLinkView(getDb(), {
      kind: 'link',
      orgId: lookup.orgId,
      weddingId: lookup.weddingId,
      weddingVendorId: lookup.weddingVendorId,
    }),
    logoUrl(lookup.orgId, lookup.logoKey),
    vendorBoards(lookup),
  ])

  const details = [
    lookup.weddingCoupleDisplayName,
    lookup.weddingDate ? formatCivilDate(locale, lookup.weddingDate) : null,
    lookup.weddingVenue,
  ].filter((v): v is string => Boolean(v))

  return (
    <div className="min-h-dvh bg-muted/40 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center gap-2.5">
          <StudioMark name={lookup.orgName} logoUrl={logo} className="size-8" />
          <p className="text-muted-foreground min-w-0 text-sm">
            {t('sharedWith', { org: lookup.orgName })}
          </p>
        </div>

        <div className="border-border bg-background rounded-[var(--radius-container)] border p-6">
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
          <h2 className="mb-2 text-sm font-semibold tracking-tight">
            {view.fullDay ? t('timelineFullTitle') : t('timelineTitle')}
          </h2>
          <div className="border-border bg-background overflow-hidden rounded-[var(--radius-container)] border">
            {view.timeline.length === 0 ? (
              <p className="text-muted-foreground p-4 text-sm">
                {view.fullDay ? t('fullEmpty') : t('timelineEmpty')}
              </p>
            ) : (
              view.timeline.map((item, i) => (
                <div
                  key={item.id}
                  // The whole day (spec 0007): the vendor's own rows carry the accent bar, so a
                  // photographer finds their slots among everyone else's at a glance.
                  className={`flex gap-3.5 p-3.5 ${i > 0 ? 'border-border border-t' : ''} ${
                    view.fullDay && item.isOwn
                      ? 'border-l-4 border-l-[color:var(--gn-action,var(--primary))] bg-muted/40'
                      : ''
                  }`}
                >
                  <span className="w-14 flex-none text-right font-mono text-sm font-semibold tabular-nums">
                    {item.startsAt}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      {item.title}
                      {item.vendorName && !item.isOwn && (
                        <span className="text-muted-foreground"> · {item.vendorName}</span>
                      )}
                    </p>
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

        {boards.length > 0 && (
          <VendorBoards
            boards={boards}
            labels={{
              download: t('download'),
              close: t('close'),
              open: String(t.raw('openImage')),
              openFile: String(t.raw('openFile')),
            }}
            locale={locale}
            actions={{
              refresh: refreshBoardImages.bind(null, token),
              download: boardImageDownload.bind(null, token),
              open: boardFileOpen.bind(null, token),
            }}
          />
        )}

        {view.plannerNote && (
          <section className="mt-5">
            <h2 className="mb-2 text-sm font-semibold tracking-tight">{t('plannerNeedsTitle')}</h2>
            <div className="border-border bg-background rounded-[var(--radius-container)] border p-4">
              <p className="text-sm whitespace-pre-wrap">{view.plannerNote}</p>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

/** The one outcome that is not the vendor's own data: unknown, expired or revoked, all alike. */
function Gone({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/40 px-4">
      <div className="border-border bg-background max-w-sm rounded-[var(--radius-container)] border p-6 text-center">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-2 text-sm">{body}</p>
      </div>
    </div>
  )
}
