import { listWeddings, type WeddingSummary } from '@guestnote/db'
import { cx } from '@guestnote/ui/cx'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { getDb } from '../../../../lib/db.ts'
import { currentMemberships, currentOrgId } from '../../../../lib/principal.ts'
import { app } from '../../../../lib/routes.ts'
import { todayCivil } from '../../../../lib/tminus.ts'
import {
  parseQuery,
  parseView,
  WEDDING_VIEWS,
  type WeddingView,
  weddingList,
} from '../../../../lib/wedding-list.ts'

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
 *
 * ## Search and views live in the URL (spec 0009 C3)
 *
 * `?q=` from a GET form and `?view=` from plain links, filtered here by `lib/wedding-list.ts`.
 * So the list works with no JavaScript, Back undoes a search, and "the past weddings matching
 * Janssens" is a link a planner can send. Rejected: a client-side filter as the vendor directory
 * had -- it filtered as you type, but the query died on every navigation, and coming back to the
 * list from a wedding is exactly when a planner wants it still there. (The directory has since,
 * 2026-10-04, mirrored its filters into the URL instead -- `components/vendors/filters.ts`.)
 */
export default async function WeddingsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[]; q?: string | string[] }>
}) {
  const [memberships, orgId, t, locale, params] = await Promise.all([
    currentMemberships(),
    currentOrgId(),
    getTranslations('app'),
    getLocale(),
    searchParams,
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
  const all = await listWeddings(getDb(), memberships, orgId)

  // An org with no weddings at all keeps its one sentence: no search box and no views over
  // nothing, which would read as "your search found nothing" to somebody who has not searched.
  if (all.length === 0) {
    return (
      <Page title={t('weddings.title')}>
        <p className="text-muted-foreground max-w-prose text-sm leading-relaxed">
          {t('weddings.empty')}
        </p>
      </Page>
    )
  }

  const view = parseView(params.view)
  const query = parseQuery(params.q)
  const { rows, counts } = weddingList(all, { view, query, today: todayCivil() })

  return (
    <Page title={t('weddings.title')}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <ViewLinks
          view={view}
          query={query}
          counts={counts}
          label={t('weddings.views.label')}
          names={{
            upcoming: t('weddings.views.upcoming'),
            past: t('weddings.views.past'),
            archived: t('weddings.views.archived'),
            all: t('weddings.views.all'),
          }}
        />
        <SearchForm
          view={view}
          query={query}
          label={t('weddings.search.label')}
          placeholder={t('weddings.search.placeholder')}
          submit={t('weddings.search.submit')}
        />
      </div>

      {rows.length === 0 ? (
        <div className="mt-6">
          <p className="text-muted-foreground max-w-prose text-sm leading-relaxed">
            {query ? t('weddings.noMatch', { query }) : t(`weddings.emptyView.${view}`)}
          </p>
          {query ? (
            <Link
              href={app.weddings({ view })}
              className="focus-visible:outline-ring mt-3 inline-block rounded-sm text-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {t('weddings.clearSearch')}
            </Link>
          ) : null}
        </div>
      ) : (
        <ul className="divide-border bg-card mt-6 divide-y overflow-hidden rounded-[var(--radius-container)] border">
          {rows.map((w) => (
            <li key={w.id}>
              <Link
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
              </Link>
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
 * The four views, as links with counts. Links and not tabs: each is its own URL, the page is
 * server-rendered per view, and a `tablist` would promise arrow-key panel switching that a
 * navigation does not do -- the same call `components/money/money-switch.tsx` makes. Each link
 * keeps the query, so switching view searches the other bucket for the same name.
 */
function ViewLinks({
  view,
  query,
  counts,
  label,
  names,
}: {
  view: WeddingView
  query: string
  counts: Readonly<Record<WeddingView, number>>
  label: string
  names: Readonly<Record<WeddingView, string>>
}) {
  return (
    <nav aria-label={label}>
      <ul className="m-0 flex list-none flex-wrap items-center gap-1 p-0 text-sm">
        {WEDDING_VIEWS.map((key) => {
          const current = key === view
          return (
            <li key={key}>
              <Link
                href={app.weddings({ view: key, q: query })}
                aria-current={current ? 'page' : undefined}
                className={cx(
                  'focus-visible:outline-ring inline-flex items-baseline gap-1.5 rounded-[var(--radius)] px-2.5 py-1.5 focus-visible:outline-2',
                  current
                    ? 'bg-muted text-foreground font-semibold'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {/* The space is for the accessible name, "Komend 2" rather than "Komend2"; the
                    flex gap already spaces it on screen, where a lone space is dropped. */}
                {names[key]}{' '}
                <span className="text-muted-foreground text-xs tabular-nums">{counts[key]}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/**
 * A GET form, so it needs no JavaScript and leaves `?q=` in the URL. The view rides along as a
 * hidden field because a form submit replaces the whole query string; without it, searching on
 * *Voorbij* would land on *Komend*. Left out on the default view so the URL stays the plain one.
 * The landmark is the `<search>` element rather than `role="search"` on the form: Biome's
 * `useSemanticElements` refuses the role where the element exists.
 */
function SearchForm({
  view,
  query,
  label,
  placeholder,
  submit,
}: {
  view: WeddingView
  query: string
  label: string
  placeholder: string
  submit: string
}) {
  return (
    <search>
      <form action={app.weddings()} method="get" className="flex min-w-0 gap-2">
        {view === 'upcoming' ? null : <input type="hidden" name="view" value={view} />}
        <input
          type="search"
          name="q"
          defaultValue={query}
          aria-label={label}
          placeholder={placeholder}
          className="h-[var(--control-h)] w-56 min-w-0 rounded-[var(--radius)] border border-[var(--input)] bg-transparent px-3 text-sm"
        />
        <button
          type="submit"
          className="text-foreground hover:bg-muted focus-visible:outline-ring inline-flex h-[var(--control-h)] cursor-pointer items-center rounded-[var(--radius)] border border-[var(--input)] px-3 text-xs font-medium focus-visible:outline-2"
        >
          {submit}
        </button>
      </form>
    </search>
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
