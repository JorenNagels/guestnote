# Spec 0001 — a planner moves around the dashboard

**Date:** 2026-08-20 · **Status:** Specified, not built
**Built so far:** the Data section only — migration `0005_org_read_for_members`,
`listOrgsForUser`, `getWedding` and their tests, landed 2026-08-20. Status stays
`Specified, not built` until the shell itself exists; see `docs/specs/README.md`.
**Amended 2026-08-20**, before any code: the palette fetches on open rather than being fed
by the layout (§Search), and `getWedding`'s signature is what shipped, not what was drafted.
**Phase:** M3, the authenticated shell — promised by name in `apps/web/src/app/pro/layout.tsx:17`
· **Bar:** a planner opens Guestnote, sees whose workspace they are in, and reaches any wedding
in two keystrokes.

The permanent left navigation for `app.guestnote.be`: an organisation head that doubles as a
switcher, one nav section, a wedding-context section, an account menu, a collapsible rail, a
phone drawer, and a ⌘K palette that jumps to a wedding. It replaces the tab bar of a
spreadsheet workbook and the act of scrolling a WhatsApp thread to remember which couple you
were thinking about.

## Already settled elsewhere

Scouted before any question was asked, and accepted unchanged.

| Decision | Where it was already made |
|---|---|
| Three root layouts, no shared `app/layout.tsx` — the surfaces share no `lang`, fonts or token scope | `apps/web/README.md:160` |
| `app.` resolves to `{kind:'app'}` and rewrites to `/pro/*`; `/api/*` bypasses; `private, no-store` + `X-Robots-Tag: noindex` | `packages/core/src/hosts.ts:218`, `apps/web/src/proxy.ts:147`, `:257` |
| `/pro` never reaches the URL bar; every href comes from `lib/routes.ts` because `typedRoutes` is off | `apps/web/src/lib/routes.ts:19`, `apps/web/next.config.ts:50` |
| The session gate is the nested layout, not the proxy. No session → `/login?reason=session-expired` | `apps/web/src/app/pro/(app)/layout.tsx:29`, CLAUDE.md invariant 7 |
| The authenticated shell — `getSession()`, the org switcher, the nav — belongs in `(app)/layout.tsx` at M3 | `apps/web/src/app/pro/layout.tsx:17` |
| No org segment in dashboard URLs; the org is resolved from memberships, not routed | `apps/web/src/lib/principal.ts:43` |
| `landingOrgId` picks the landing org deterministically: owner → admin → member, then org id | `packages/db/src/repos/memberships.ts:215` |
| `Principal` is a three-member discriminated union; `orgStaff` may never carry a `weddingId` | `packages/db/src/tenant.ts:32`, CLAUDE.md invariant 3 |
| Roles that exist: `owner\|admin\|member` and `couple\|editor`. No `vendor` **yet** — `research/09` §a assigns it to P18 and the schema defers it, `text` + `CHECK` so adding it later is one `ALTER` | `packages/db/src/schema/orgs.ts:16`, `packages/db/src/schema/weddings.ts:28` |
| Locale comes from the `NEXT_LOCALE` cookie, never `Accept-Language`, and never a URL prefix on the dashboard | `apps/web/src/lib/locales.ts:12`, `apps/web/src/i18n/request.ts:44` |
| `LocaleSwitcher`'s `onSelect` path, and a `setLocale` Server Function that writes the cookie, both already exist and are tested | `packages/ui/src/locale-switcher.tsx:17`, `apps/web/src/components/auth/actions.ts:81` |
| Density is `data-density` on `<html>`; `compact` switches `--row-h` 44→32px, `--cell-x` and `--control-h` together | `apps/web/src/app/pro/layout.tsx:45`, `design-system/tokens.css:100` |
| Dark mode is a `.dark` **class**, never `prefers-color-scheme` | `design-system/tokens.css:21` |
| A state is never carried by hue alone | `research/08-design-system.md:58` |
| `packages/ui` exports exactly `cx, button, field, inline-error, live-region, locale-switcher`, and `globals.css` must `@source` it | `packages/ui/package.json:7`, `apps/web/src/app/globals.css:37` |

### Traps this spec has to route around

| Trap | Where it is written down |
|---|---|
| **`public/` files 404 on the app host** — measured 2026-08-18; the proxy matcher excludes only five paths, so `/logo.svg` becomes `/pro/logo.svg`. Every icon here is inlined SVG, as `wordmark.tsx` already is | `apps/web/src/proxy.ts:73`, `apps/web/src/components/brand/wordmark.tsx:6` |
| **`/api/*` must keep bypassing the rewrite** — "the single most breakable line in the file" | `apps/web/src/proxy.ts:141` |
| **`principalForWedding` returns `null` for an owner/admin on purpose** — `assertScoped` refuses `orgStaff` + `weddingId`. An owner reading one wedding uses the org-wide principal and filters in the query | `packages/db/src/repos/memberships.ts:175` |
| **`principalForOrg` returns `null` for a `member`** — a member has no legitimate org-wide principal, so `getOrg` cannot name their organisation | `packages/db/src/repos/memberships.ts:163` |
| **A member's wedding list is one transaction per assigned wedding, issued sequentially** — do not "optimise" with `Promise.all` | `packages/db/src/repos/weddings.ts:89` |
| **GUCs are `is_local = true`, first statements in the transaction** — never session-level `SET` | `packages/db/src/tenant.ts:53`, CLAUDE.md invariant 4 |
| **The fake-timer trap** — Testing Library only auto-advances *Jest's* fake timers, so `findBy*` under `vi.useFakeTimers()` hangs to timeout | CLAUDE.md, Testing |

## Decisions taken here

### Scope

**The navigation chrome, plus the one destination the palette needs.** The build is the
sidebar, the org head and switcher, the account menu, the collapse rail, the phone drawer, the
⌘K palette — and a minimal `/weddings/[id]` overview page, because "jump to any wedding by
typing" is the palette's whole value and it needs somewhere to land.

Rejected: chrome only, with no wedding route. It was the initial scope and it was given up
deliberately once the palette came in — a palette that lists weddings and then dumps you back
on the list teaches the planner not to trust it, which is worse than not having one. The cost
accepted is that this spec now touches `packages/db` (a repo function and a policy) rather than
being a pure component change, so it needs `tenancy-auditor` before it commits.

Also rejected: a real landing page at `/`. `/` keeps redirecting to `/weddings`
(`pro/(app)/page.tsx:22`). The P16 "due this week across every wedding" view is a feature with
its own cross-wedding read path, and putting a **Vandaag** item in the nav before it exists
would be a nav item that highlights the wrong thing.

### The chrome is a persistent left sidebar

**A sidebar, not a topbar and not an icon rail plus a second column.** It scales to the eight
sections PH2–PH4 adds without a chrome rewrite, and it is what the genre trains planners to
expect. Rejected: a topbar with a per-wedding tab strip, which needs no new tokens and keeps the
content column full-width — given up because a tab strip wraps past about five sections, so PH2
would force the shell to be rebuilt. Also rejected: a thin global icon rail beside a contextual
column, which has the most room to grow and the most chrome to build, for one nav item today.

**No `--sidebar-*` token group is introduced.** The sidebar is built from `--card`, `--muted`,
`--border` and `--foreground`, which are already contrast-verified in both modes.
`docs/adr/0003-one-app-three-hosts.md:192` anticipates the group and says it needs a contrast pass in both modes; that
pass is design work this spec does not do, and `design-system/tokens.css` is on the login
brief's must-remain-untouched list (`.impeccable/surfaces/src-app-pro-public-login.md:210`). The
cost accepted: the sidebar has no surface of its own, so it separates from the content by a
border rather than by tone.

### The organisation heads the sidebar; Guestnote's mark appears nowhere

**Top of the sidebar: the org monogram and name. Bottom: the account menu.** Guestnote's own
wordmark is on login and on marketing and nowhere inside the signed-in app.

Rejected: the Guestnote mark heading the sidebar with the org top-right of a content header —
the literal first description of this feature, and given up because this is sold to planners who
brand their own service. Putting our mark above Studio Vero's, inside Studio Vero's workspace,
is the wrong hierarchy. Also rejected: org at the top with the account menu moved top-right,
which keeps neither menu buried but pays for a header band above every page.

**The org mark is initials on a tinted square, derived from `organizations.name`.**
`organizations.brand` is untyped nullable `jsonb` with no shape, no upload path and no reader
anywhere (`packages/db/src/schema/orgs.ts:35`), and there is no file storage in this repo. Logo
upload is its own spec.

### The switcher exists only when there is something to switch

**One org → the head is a static label, no disclosure affordance at all. Two or more → the head
becomes a menu listing them.** Rejected: a switcher control regardless of membership count, for
the consistent affordance — given up because nearly every planner is staff at exactly one
organisation, so for nearly everyone it would be a control that does nothing. Rejected for now:
a wedding switcher in the same slot; if one is wanted it can be added once there is more than
one wedding-scoped section to land in.

### The chosen org is a validated cookie

**`gn_org` holds the org id. Every read checks it against the user's memberships and falls back
to `landingOrgId` when it is absent, stale, or names an org they have been removed from.**

`principal.ts:64` already anticipates this exact shape — "the choice becomes explicit (a
segment, or a cookie the switcher writes), while every caller keeps asking the same question" —
so `currentOrgId()`'s body is replaced and no caller changes.

Rejected: `org_members.last_used_at`, which `memberships.ts:215` explicitly deferred *until the
switcher arrives*. It has arrived, and it is still not being added: the column follows a planner
across devices, but it costs a migration and a write on every switch, landing on one of only two
tables whose policy runs on `app.user_id` rather than a tenant key. That comment gets amended to
record that the switcher shipped on a cookie and why, rather than being left promising a column
that did not happen.

Rejected: an org segment in the URL. It would reverse `principal.ts:43` and rewrite every
builder in `routes.ts`.

Cost accepted: the org choice does not follow the planner to a second device. It fails safe by
construction — an unrecognised cookie value is discarded, never trusted.

### Collapse is a persisted icon rail

**`gn_nav` holds `expanded` or `collapsed`. Collapsed is a ~56px rail: org monogram, section
icons, avatar.** The cookie exists because the server must know the width before first paint; a
client-only toggle renders the sidebar wide and then snaps it narrow on every navigation.

Rejected: the same rail without persistence — no cookie and no new state to test, but a planner
who collapses it collapses it again every morning. Rejected: collapsing to nothing behind a
toggle, which gives the most content width and reuses the phone mechanism, but leaves no
persistent sense of place.

Cost accepted: a third preference cookie, and icon-only targets that must carry accessible
names rather than relying on a tooltip.

### Below `md` it is an off-canvas drawer

**A slim mobile header with a menu button; the sidebar slides over the content and closes on
navigate.** A 56px rail on a 390px screen spends 14% of the width on a nav with one item, and a
rail's tooltips do not exist on touch.

Rejected: the rail at every width — one mechanism, least to get wrong, but permanent width on
the smallest screen with unlabelled icons exactly where the planner is least familiar. Rejected:
a thumb-reachable bottom bar on phone, which is right for someone holding a phone at a venue but
is a second nav component with its own layout, active state and safe-area handling, for one nav
item.

Cost accepted: a focus trap, Escape handling, focus return to the trigger, and a mobile-only
header band that exists at no other breakpoint.

### The account menu carries all three preferences

**Afmelden, taal, thema, dichtheid.** The dark tokens and `[data-density="compact"]` are fully
specified and contrast-verified but unreachable from the running app — nothing in `apps/web`
ever sets `.dark`, and `data-density` is hard-coded `comfortable` at `pro/layout.tsx:45`. This
menu is the first surface that can reach either, and shipping without them means reopening this
component within a month.

Rejected: afmelden and taal only, which matches what already exists and leaves two finished
token sets stranded. Rejected: afmelden alone with preferences on a `/settings` page — `/settings`
does not exist and is not in this scope, so that ships a dashboard with no way to change
language from inside it.

### Preferences stay in cookies, and two comments get corrected

**`NEXT_LOCALE`, `gn_theme`, `gn_density`, `gn_nav`, `gn_org` — all cookies.**

`lib/locales.ts:29` and `pro/layout.tsx:40` both promise that *at M3 this reads the user row
instead*. M3 is this spec, and the promise is not being kept. Root layout B reads cookies with
zero queries; reading a user row there puts a database round trip in front of every single
dashboard render, before anything else runs. The promise was written before that cost was
visible. **Both comments are amended in this change** — the repo's rule is that a decision that
changes says what changed and when, and a comment still promising the old behaviour is a defect
because someone will trust it.

Rejected: a `user_preferences` table keyed by `user_id`. It is the right long-term shape and
avoids extending Better Auth's schema, but it costs a migration, a tenancy classification with a
stated reason, a policy on `app.user_id` and a query in the root layout — a database feature
riding inside a nav-component spec. Rejected outright: extending `users` via Better Auth
`additionalFields`, which puts application columns on provider-owned schema and provider config,
the exact coupling the auth seam exists to prevent (CLAUDE.md invariant 5).

Cost accepted: preferences do not follow a planner to a second device.

**`await connection()` in `pro/layout.tsx` becomes genuinely redundant here** — reading cookies
in the root layout is dynamic input, which is what that call was standing in for. Its comment
says removal is correct at M3; this is M3, so it goes, and the comment goes with it. The build
output must show `ƒ /pro`, not `○ /pro`, after removal — that is the assertion, not the
reasoning.

### Org names need a second policy on `organizations`

This is the one part of the feature that reaches the gate. **`Memberships` carries only
`{orgId, role}`** (`repos/memberships.ts:33`), and `organizations` is RLS-scoped on
`app.org_id` (`migrations/0001_rls.sql:85`), so the `withUser` transaction that resolves
memberships cannot read a name. There is no path today that gets the sidebar head its text for
an org `member`, nor a list of names for the switcher.

**A second, `SELECT`-only policy on `organizations`: you may read an org you hold an
`org_members` row for.** Predicate is an `EXISTS` against `org_members` keyed on
`current_setting('app.user_id', true)::uuid`. Postgres ORs permissive policies, so
`tenant_isolation` is untouched and `withTenant` behaves exactly as before; under `withUser`,
where `app.org_id` is blanked to `''` (`tenant.ts:102`), the new policy is the one that decides.
The `EXISTS` reads `org_members`, whose own `own_memberships` policy already filters to
`app.user_id`, so the nesting narrows rather than widens.

Then one `listOrgsForUser(db, userId)` in `packages/db/src/repos/memberships.ts`, using
`withUser`, returning `{ id, slug, name }[]`. One transaction, correct for owner, admin and
member alike, and the head and the switcher share it.

`SELECT` only, never `for all`: a member must not be able to write the organisation row.

Rejected: one `withTenant` transaction per org via `principalForOrg` — no schema change, and it
copies a precedent that already exists deliberately at `repos/weddings.ts:89`. Given up because
`principalForOrg` returns `null` for a `member` by design, so assigned staff would still get a
nameless head, and a multi-org owner would pay N transactions per page render. Rejected: falling
back to the user's own name when the org name is unreachable — zero database work, but the same
chrome would mean two different things depending on role, and a member would never learn which
organisation they are working in.

Cost accepted, stated plainly: the policy admits the whole `organizations` **row** to any member
of that org, including `plan`, `mollie_customer_id` and `subscription_status`. The repo function
selects `id, slug, name` and nothing else, so no code path exposes the rest — but the boundary
here is the query, not the grant. Column-level grants or a `security_barrier` view would move it
into the database; both were rejected as more machinery than one `select` list, and this
paragraph is the record of that being a choice rather than an oversight. `0002_grants.sql` grants
table-wide `select`, so nothing there changes.

### Search is in the sidebar and opens the palette

**No header band.** A search item at the top of the sidebar nav opens the ⌘K palette; ⌘K and
Ctrl+K do the same. One search implementation, not two, and the content area stays edge to edge
— which matters for the 300-row tables that `--row-h` exists for.

Rejected: a slim header holding a search field. It is more discoverable than a keyboard hint,
but it reinstates a band this spec had already designed away and then has to share a row with
page actions like **+ Nieuw** without colliding. Rejected: a full header with search, a bell and
the account menu, which would have reversed the sidebar-foot decision and left the foot empty.

Cost accepted: a planner who never learns ⌘K reaches search only through one sidebar item.

**The palette fetches its list once on first open, then filters locally.** A Server Function
returns the weddings the first time ⌘K is pressed; the client holds them for the life of the page
and every keystroke after that filters in memory.

Amended 2026-08-20, before any code was written: this section first said the layout resolves the
list and hands it to the palette. Planning it showed that to be the worse option on every axis
but one. A member's wedding list is **one transaction per assigned wedding, issued sequentially**
(`repos/weddings.ts:89`, sequential on purpose), so resolving it in the layout makes every
dashboard page pay N round trips on the chance that the palette opens — and puts the list in
every page's RSC payload besides.

Still rejected: a `searchWeddings(query)` Server Function called per keystroke. A round trip per
keystroke loses to a spreadsheet's Ctrl+F, and that is the bar. The distinction that resolves the
two is that **one** round trip per page load is not per-keystroke; the local filter is kept, only
the fetch moves.

Cost accepted: roughly 100ms on the very first ⌘K of a page load, where the layout-resolved
version would have been instant.

Palette contents: **Bruiloften** (every wedding the principal can see) and **Opdrachten** (org
wisselen, taal, thema, dichtheid, afmelden).

### Notifications are not built

Skipped entirely, not deferred behind an empty bell. `audit_log` exists but is an append-only
forensic trail with no per-user read state, so a feed built on it cannot mark anything read, and
its rows were not written as copy for a planner to read. Nothing in the product emits a
notification-worthy event yet.

### `/weddings/[id]` is a minimal overview, staff only

Name, date, status. It exists so a palette jump lands somewhere real and so the sidebar's
wedding-context section has an active state that can be tested.

**`getWedding` takes two paths, because the principal model demands it.** Owner and admin use
the org-wide principal from `principalForOrg` and filter by wedding id inside the query — calling
`principalForWedding` for them returns `null` on purpose (`memberships.ts:175`), and a shell that
did so would render a 404 for the person who owns the business. A `member` uses
`principalForWedding`, which yields `assignedStaff` only when both the `org_members` and
`wedding_members` rows are present.

`null` is a 404, never a 403: `memberships.ts:26` — confirming a wedding exists to somebody who
cannot see it is itself the leak.

### The signed-in-nowhere state gets no sidebar

`(app)/layout.tsx` renders the shell only when `currentOrgId()` is non-null. Otherwise the
existing centred `app.weddings.noOrg` message stands alone, as it does today. An org head with no
org above a nav with no links is chrome whose only content is the news that there is nothing here.

Rejected: consistent chrome with an empty head showing the signed-in user, so the account menu
still works — one layout, no branch, and the emptiest possible first impression of the product.
Rejected: a dedicated `/geen-toegang` route outside `(app)`, which needs new copy in three
locales and a redirect firing on every navigation attempt.

Cost accepted: one branch in the layout and a second visual mode to hold in mind.

### Where the code lives

| Path | What it gets |
|---|---|
| `apps/web/src/components/nav/` | `sidebar.tsx`, `org-menu.tsx`, `account-menu.tsx`, `palette.tsx`, `nav-item.tsx` |
| `apps/web/src/app/pro/(app)/layout.tsx` | composes the shell; branches on `currentOrgId()` |
| `apps/web/src/app/pro/(app)/actions.ts` | `switchOrg`, `setTheme`, `setDensity`, `setNavCollapsed`. **Not `setLocale`** — one already exists and is tested at `components/auth/actions.ts:81`; a second would break this spec's own reuse rule |
| `apps/web/src/app/pro/(app)/weddings/[id]/page.tsx` | the minimal overview |
| `apps/web/src/app/pro/layout.tsx` | reads `gn_theme` and `gn_density`; loses `await connection()` |
| `apps/web/src/lib/principal.ts` | `currentOrgId()` reads and validates `gn_org` |
| `packages/db/src/repos/memberships.ts` | `listOrgsForUser` |
| `packages/db/src/repos/weddings.ts` | `getWedding` |
| `packages/db/migrations/0005_org_read_for_members.sql` | the second policy, hand-written |

**Not `packages/ui`.** These components read `lib/routes.ts`, `usePathname` and next-intl;
`packages/ui` is presentational primitives with one export path per public file and no app
coupling. The one thing that does come from there is `LocaleSwitcher`, already wired on the sign-in
screen at `apps/web/src/components/auth/auth-flow.tsx:339` through its `onSelect` branch.

## Behaviour

### The sidebar, expanded

Top to bottom: org monogram + name (a menu when there are two or more orgs, a plain label
otherwise) · **Zoeken** · **Bruiloften** · the wedding-context section when inside a wedding
(the couple display name and date as a heading, **Overzicht** beneath) · a rule · avatar +
name, opening the account menu upward.

`aria-current="page"` marks the active item. `/weddings/[id]` keeps **Bruiloften** unmarked and
marks **Overzicht** — the wedding section is where you are, and marking both would make the
list look like the current page.

### States

| State | What renders |
|---|---|
| **Signed in, no memberships** | No sidebar. The centred `noOrg` + `noOrgHint` message alone. |
| **One org, no weddings** | Full sidebar. Head is a plain label with no disclosure. `Bruiloften` active, body shows `app.weddings.empty`. |
| **One org, one or many weddings** | As above; the palette lists them. |
| **Two or more orgs** | Head is a menu. The list shows every org, current one marked. Choosing one writes `gn_org` and revalidates. |
| **Inside a wedding** | Wedding-context section appears with the couple name, the date (or `dateUnknown`), and **Overzicht**. |
| **Collapsed** | 56px rail: monogram, search icon, section icons, avatar. Every target carries an accessible name; a tooltip is decoration, not the label. |
| **Below `md`** | Sidebar off-canvas. A slim header with a menu button. Opening traps focus, Escape closes, closing returns focus to the button, navigating closes it. |
| **Loading** | The shell is server-rendered with the session and memberships already resolved, so there is no sidebar skeleton. Only the content area streams. |
| **Error** | A failed membership resolve is not a partial sidebar. It throws to the nearest error boundary, because a nav rendered from unknown memberships is the shape that shows one planner another's weddings. |
| **`gn_org` names an org they left** | Silently discarded, `landingOrgId` decides, no error shown. Being removed from an org is not the planner's mistake to be told about. |
| **Printed** | `@media print` hides the sidebar entirely. A run sheet printed for a venue with no signal wants the page, not the chrome. |

### Keyboard

⌘K / Ctrl+K opens the palette from anywhere. Escape closes it and returns focus. ↑/↓ move the
active option, Enter activates it. The palette is a `role="dialog"` wrapping the combobox
pattern with `aria-activedescendant`; the collapse toggle carries `aria-expanded` and
`aria-controls`.

## Data

**No new table and no new column.** One new policy and two new repo functions.

| Change | Shape | Why |
|---|---|---|
| `organizations` gains `org_read_for_members` | `create policy … for select using (exists (select 1 from org_members where org_id = organizations.id and user_id = nullif(current_setting('app.user_id', true), '')::uuid))` | The sidebar head and the switcher need names, and `withUser` cannot read the table today |
| `listOrgsForUser(db, userId)` | `withUser` → `{ id, slug, name }[]` | One transaction for every role, `member` included |
| `getWedding(db, m, orgId, weddingId)` | takes `Memberships` and resolves the principal itself: org-wide + `eq` filter for owner/admin, `assignedStaff` for a member | `principalForWedding` returns `null` for owner/admin by design, so the caller must not pick |

`organizations` stays in `SELF_SCOPED_TABLES` (`packages/db/src/schema/index.ts:39`); nothing needs
reclassifying, because no table is added. `schema-coverage.test.ts` asserts FORCE plus a policy
whose predicate names the tenant key — a table carrying a **second** policy must not trip it, and
if it does, the test is what changes, with a note saying why.

## Permissions

| | owner | admin | member | editor (no org row) | couple |
|---|---|---|---|---|---|
| Sees the sidebar | ✓ | ✓ | ✓ | — | — |
| Reads the org name | ✓ | ✓ | ✓ (new policy) | — | — |
| Switches org | ✓ if multi | ✓ if multi | ✓ if multi | — | — |
| Lists weddings | all in org | all in org | assigned only | — | — |
| Opens `/weddings/[id]` | any in org | any in org | assigned only | — | — |
| Palette lists | all in org | all in org | assigned only | — | — |
| Changes own taal/thema/dichtheid | ✓ | ✓ | ✓ | ✓ | ✓ |

An outside `editor` and a `couple` hold no `org_members` row, so `landingOrgId` returns `null`,
`currentOrgId()` returns `null`, and they get the no-sidebar state. **That is the existing
behaviour, not a regression**, and it is the couple-portal gap `memberships.ts:192` assigns to
P7: their `orgId` cannot be derived from anywhere yet. This spec does not close it and does not
pretend to.

## Copy

NL is authored; EN and FR are translations landing in the same commit. Keys under the existing
`app` namespace in `apps/web/messages/{nl,en,fr}.json`.

| Key | NL | EN | FR |
|---|---|---|---|
| `app.nav.label` | Hoofdnavigatie | Main navigation | Navigation principale |
| `app.nav.search` | Zoeken | Search | Rechercher |
| `app.nav.collapse` | Zijbalk inklappen | Collapse sidebar | Réduire la barre latérale |
| `app.nav.expand` | Zijbalk uitklappen | Expand sidebar | Développer la barre latérale |
| `app.nav.openMenu` | Menu openen | Open menu | Ouvrir le menu |
| `app.nav.closeMenu` | Menu sluiten | Close menu | Fermer le menu |
| `app.nav.weddingSection` | Deze bruiloft | This wedding | Ce mariage |
| `app.nav.overview` | Overzicht | Overview | Aperçu |
| `app.org.label` | Organisatie | Organisation | Organisation |
| `app.org.switch` | Van organisatie wisselen | Switch organisation | Changer d'organisation |
| `app.org.current` | Huidige organisatie | Current organisation | Organisation actuelle |
| `app.account.label` | Account | Account | Compte |
| `app.account.language` | Taal | Language | Langue |
| `app.account.theme` | Thema | Theme | Thème |
| `app.account.themeLight` | Licht | Light | Clair |
| `app.account.themeDark` | Donker | Dark | Sombre |
| `app.account.density` | Dichtheid | Density | Densité |
| `app.account.densityComfortable` | Ruim | Comfortable | Confortable |
| `app.account.densityCompact` | Compact | Compact | Compact |
| `app.palette.title` | Zoeken en opdrachten | Search and commands | Recherche et commandes |
| `app.palette.placeholder` | Zoek een bruiloft of typ een opdracht | Search a wedding or type a command | Cherchez un mariage ou tapez une commande |
| `app.palette.commands` | Opdrachten | Commands | Commandes |
| `app.palette.empty` | Niets gevonden. | Nothing found. | Aucun résultat. |
| `app.palette.close` | Sluiten | Close | Fermer |

**Reused, not duplicated** — one string, one key: `app.signOut`, `app.weddings.title` (for both
the nav item and the palette group), `app.weddings.dateUnknown`, `app.weddings.status.*`,
`app.weddings.empty`, `app.weddings.noOrg`, `app.weddings.noOrgHint`.

`⌘K` is not a translated string.

## Not in scope

| Not building now | Why, or which phase |
|---|---|
| Org logo upload | `organizations.brand` has no shape, and there is no file storage anywhere in this repo. Its own spec. |
| A `/settings` page | Needs the org-settings permission split worked out first. It is also what would give the sidebar its second real nav item. |
| Search and notifications in a header | No header band exists by decision. Notifications have no table; `audit_log` is a forensic trail with no read state, and nothing emits events. |
| The passkey enrollment prompt | `.impeccable/surfaces/src-app-pro-public-login.md:334` says the shell hosts it, and the shell now exists — so this is where it lands next. It has its own trigger contract, copy, persisted dismissal state and a WebAuthn registration call: a feature wearing chrome's clothes. Rejected outright: reserving an empty slot for it, which is unused code no test can fail on. |
| Which operations need a fresh passkey assertion | Named as open and assigned to the shell at `src-app-pro-public-login.md:411`. Still open. |
| Guests, budget, vendors, run-sheet, files nav items | No tables — the classification at `packages/db/src/schema/index.ts:24-80` has no bucket entry for any of them. Rejected: showing them disabled or as placeholder pages — a greyed list of six things you cannot click reads as a demo, and the competitor is a working spreadsheet. |
| A **Taken** nav item | `tasks` and `task_comments` exist, but no page does. It arrives with the tasks feature, which is what this shell was built to receive. |
| **Vandaag** / a real `/` landing | P16, and it needs a cross-wedding read path. A nav item pointing at a redirect would highlight the wrong thing. |
| `--sidebar-*` tokens | `docs/adr/0003-one-app-three-hosts.md:192` — needs a contrast pass in both modes. Design work, not plumbing. |
| A `user_preferences` table | Cookies chosen instead; see above. The right long-term shape, deferred with its reason recorded. |
| `org_members.last_used_at` | Deferred again, on a cookie. `memberships.ts:215` gets amended rather than left promising it. |
| The couple portal | `PRODUCT.md:144` and `research/08-design-system.md:154` leave it explicitly undecided: same shell scoped down, or a separate surface. P7. |

## Done means

- [ ] Sidebar renders for owner, admin and member, with the org name present in all three
- [ ] Head is a plain label at one org and a menu at two or more; switching writes `gn_org` and survives a reload
- [ ] A `gn_org` naming an org the user is not a member of falls back to `landingOrgId` with no error surfaced
- [ ] Collapse persists across a reload with no width flash on first paint
- [ ] Below `md`: drawer opens, traps focus, closes on Escape, returns focus, closes on navigate
- [ ] ⌘K and Ctrl+K open the palette; a wedding jump lands on `/weddings/[id]`; every command works
- [ ] Account menu changes taal, thema and dichtheid, each surviving a reload; `.dark` and `data-density="compact"` both actually reach `<html>`
- [ ] `/weddings/[id]` resolves for an owner, for an admin, and for an assigned member; returns 404 — not 403 — for a member who is not assigned
- [ ] Signed in with no memberships: no sidebar, `noOrg` message alone
- [ ] `@media print` hides the chrome
- [ ] `lib/locales.ts:29` and `pro/layout.tsx:40` amended: they no longer promise the user row at M3, and say what shipped instead
- [ ] `memberships.ts:215` amended: says the switcher shipped on a cookie and why the column stayed deferred
- [ ] `await connection()` removed from `pro/layout.tsx`, its comment removed with it, and the build output shows `ƒ /pro`
- [ ] Every icon inlined — nothing added to `public/` (`proxy.ts:73`)
- [ ] `npm run check` green
- [ ] `npm run test:db` green, **both tiers** — the new policy is the point of the exercise, and it needs a test that a member reads their own org's name and reads **no other org's**
- [ ] `mutation-tester` on the new assertions: break the policy predicate, break the `gn_org` membership check, break the owner-vs-member branch in `getWedding`, and watch each one fail
- [ ] `tenancy-auditor` clean — this change adds a policy and two read paths
- [ ] `npm run build -w @guestnote/web`, then the three-host `curl` matrix on `npm run dev`
- [ ] Ask `/verify` which rungs this actually needs rather than trusting this list

If the policy behaves differently through Neon's pooler than it does against the local
container, that is a **measured** finding and it earns an ADR, not an amendment here.

## Still open

- **Which operations require a fresh passkey assertion** rather than a live session.
  `src-app-pro-public-login.md:411` assigns the question to the shell and the shell now exists.
- **The couple portal's shape** — same shell scoped down, or a separate surface. It decides
  whether this nav becomes role-conditional or stays staff-only, and it is why nothing here
  branches on `weddingMember` yet.
- **How a `couple` or an outside `editor` ever gets an `orgId`.** `memberships.ts:192` calls it
  the couple-portal gap and assigns it to P7. Until then they land on the no-sidebar state.
- **When the palette stops filtering locally.** Fine at 30 weddings, wrong at 300; nobody has
  measured where it turns.
- **Whether `--sidebar-*` tokens are wanted at all**, or whether `--card` and `--border` are
  the right long-term answer.
