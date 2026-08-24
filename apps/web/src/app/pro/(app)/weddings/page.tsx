import { listWeddings, type WeddingSummary } from '@guestnote/db'
import { getLocale, getTranslations } from 'next-intl/server'
import { getDb } from '../../../../lib/db.ts'
import { currentMemberships, currentOrgId } from '../../../../lib/principal.ts'
import { app } from '../../../../lib/routes.ts'

/**
 * The wedding list. **The first screen in this application to read tenant data.**
 *
 * That is the whole significance of the file: `withTenant` and its isolation suite have
 * existed since M2, but nothing outside a test had ever called them -- `/api/health`
 * uses `withUser` with the nil uuid on purpose. Every row below arrives through the
 * production path, scoped by the production policies.
 *
 * ## Where authorization happens, and where it does not
 *
 * Not here. `currentOrgId()` chooses which organisation to *display*; `listWeddings`
 * re-derives the principal from `org_members` / `wedding_members` and hands it to
 * `withTenant`, which sets the GUCs the policies filter on. This component never sees a
 * role and never makes a decision based on one -- research/07-auth-and-tenancy.md
 * section 3's rule that `app.org_id` is a data-scoping mechanism, never a permission.
 *
 * ## Why an empty list is not a 404
 *
 * Section 3's permission table ends "neither -> 404 (not 403 -- don't confirm the
 * wedding exists)", and that applies to a *named* wedding. A list has nothing to
 * confirm: a planner with no weddings yet and a user with no standing in the org both
 * see nothing, which is exactly the property that makes the difference unobservable.
 * The two are told apart only by whether an organisation resolved at all, which is
 * information the user already has about themselves.
 */
export default async function WeddingsPage() {
  const [memberships, orgId, t, locale] = await Promise.all([
    currentMemberships(),
    currentOrgId(),
    getTranslations('app'),
    getLocale(),
  ])

  // The layout above guarantees a session; memberships can still be empty. This branch is
  // the one the layout renders WITHOUT the shell -- no sidebar, no org head -- so it has to
  // stand on its own and centre itself rather than assuming a content column exists.
  if (!memberships || !orgId) {
    return (
      <main className="mx-auto grid min-h-dvh max-w-md place-items-center px-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t('weddings.title')}</h1>
          <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
            {t('weddings.noOrg')}
          </p>
          <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
            {t('weddings.noOrgHint')}
          </p>
        </div>
      </main>
    )
  }

  // The organisation is named by the sidebar now, not by this page. It used to read it
  // through `getOrg`, which returned `null` for an org `member` by design and so rendered a
  // blank org line for exactly the person the switcher could strand there -- fixed in
  // 5efc96a by naming it from `currentOrgs()`, and now the concern of `(app)/layout.tsx`
  // rather than of every page that happens to want a header.
  const rows = await listWeddings(getDb(), memberships, orgId)

  return (
    <Page title={t('weddings.title')}>
      {rows.length === 0 ? (
        <p className="text-muted-foreground max-w-prose text-sm leading-relaxed">
          {t('weddings.empty')}
        </p>
      ) : (
        <ul className="divide-border bg-card divide-y overflow-hidden rounded-[var(--radius)] border">
          {rows.map((w) => (
            <li key={w.id}>
              <a
                href={app.wedding(w.id)}
                className="hover:bg-muted/50 focus-visible:outline-ring flex items-baseline justify-between gap-4 px-4 py-3 focus-visible:outline-2 focus-visible:-outline-offset-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{w.coupleDisplayName}</span>
                  <span className="text-muted-foreground mt-0.5 block font-mono text-xs">
                    {w.slug}
                  </span>
                </span>

                <span className="flex shrink-0 items-baseline gap-3">
                  <time
                    className="text-muted-foreground text-xs tabular-nums"
                    dateTime={w.weddingDate ?? undefined}
                  >
                    {formatWeddingDate(w, locale, t('weddings.dateUnknown'))}
                  </time>
                  <StatusPill status={w.status} label={t(`weddings.status.${w.status}`)} />
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Page>
  )
}

/**
 * The content column. What is left of the old local `Shell` after the chrome moved into
 * `(app)/layout.tsx`: a max width, the page's own padding, and its heading.
 *
 * `max-w-5xl` rather than the old `max-w-3xl`, because the sidebar now takes its own width
 * out of the viewport and the content no longer has to centre itself against the whole
 * window. The tables this will hold want the room.
 */
function Page({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="flex items-baseline justify-between gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      </header>
      <div className="mt-7">{children}</div>
    </div>
  )
}

/**
 * `weddings.wedding_date` is a `date`, and the schema says why: a wedding date is a
 * local civil date, the same date to the couple whether they are in Brussels or Bali.
 *
 * So it is formatted in **UTC**, which looks wrong and is not. Drizzle returns
 * `YYYY-MM-DD`; `new Date()` reads that as UTC midnight; formatting it in a server
 * timezone west of Greenwich would render the day before. Pinning the zone keeps the
 * civil date the couple wrote down, which is the only date anybody means.
 */
function formatWeddingDate(w: WeddingSummary, locale: string, unknown: string): string {
  if (!w.weddingDate) return unknown
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(w.weddingDate))
}

/**
 * Status, as a word rather than a colour alone.
 *
 * research/08-design-system.md's rule for the RSVP states -- that a state is never
 * carried by hue on its own -- applies here for the same reason, even though these are
 * not RSVP states: `draft` and `live` differ by one dot of colour otherwise, and that is
 * unreadable to a protan or in bright sun at a venue.
 */
function StatusPill({ status, label }: { status: string; label: string }) {
  const live = status === 'live'
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs',
        live ? 'text-foreground' : 'text-muted-foreground',
      ].join(' ')}
    >
      <span
        aria-hidden="true"
        className={[
          'size-1.5 rounded-full',
          live ? 'bg-foreground' : 'bg-muted-foreground/50',
        ].join(' ')}
      />
      {label}
    </span>
  )
}
