# Spec 0007 — Share a moodboard and the whole day with a vendor

**Date:** 2026-09-28 · **Status:** Built 2026-09-28
**Phase:** PH3 P21 (moodboard, extended) + the S10 vendor link · **Bar:** a planner sends the
photographer one link and stops sending a PDF of the timeline and a Pinterest board by WhatsApp.

A wedding gets several named moodboards instead of one, and a planner shares any board with
chosen vendors, who see it on their existing signed link. The same link can also show a vendor
the whole day's timeline, not just their own slots. That replaces the photographer's "can you
send me the planning and the inspiration?" email thread.

Origin: a conversation with a photographer, 2026-09-28. He wants the full timeline and the
visual references. Some planners make a separate board per vendor, some keep one — both
work here.

## Already settled elsewhere

| Decision | Where it was already made |
|---|---|
| Moodboard images are `files` rows with `kind = 'image'`, one upload path, bytes in S3 | `packages/db/src/schema/files.ts:10-17`, `components/files/SPEC.md` (S5, built 2026-09-21) |
| Moodboard images are always `visibility = 'shared'` | `weddings/[id]/moodboard/actions.ts:23-25` — held by the UI only; see `files.link_read` below |
| Keys are `<orgId>/<weddingId>/<fileId>`, `assertKeyInScope` on every download | `packages/storage/src/keys.ts:20-56` |
| Image types jpeg/png/webp/gif/heic/heif/avif, no SVG/HTML, 25 MiB *(widened 2026-10-04, see the note below)* | `packages/storage/src/limits.ts:15,35-78` |
| A vendor reaches Guestnote through a signed link and the `link` principal; never an account | `vendor/SPEC.md`, `0008_vendor_link.sql`, research `09:242` |
| `withTenant` leaves `app.org_id` unset for `link`; setting it would be the leak | `0008:14-48`, `tenant.ts:36-44` |
| A `link` principal never gets a write policy | `0008:87`, `vendor/SPEC.md:70-71` |
| The link is re-resolved from its hash on every request; policies do not re-check revocation | `tenant.ts:48-58` |
| No new table is readable by a `couple` principal until the couple-portal spec | spec `0003:56-58` |
| The vendor link never shows a row's `owner_user_id` | spec `0004:117-122` |

> **2026-10-04 -- a board holds documents too.** Planners pin a venue's floor plan or a
> florist's quote next to the pictures, and an image-only board sent that PDF back to WhatsApp.
> The moodboard's allow-list (`ALLOWED_CONTENT_TYPES.image`) now also takes PDF and the six Word,
> Excel and PowerPoint types -- not `text/plain` or `text/csv`, and still never SVG or HTML. The
> kind stays `image`: `files_moodboard_kind_check`, `files.link_read` and the `couple_*`
> functions key on the kind, not the type, so a document on a shared board reaches a vendor link
> and the couple through exactly the policies above, **with no migration and no policy widened**
> (`listSharedBoards` now also selects `mime` and `size_bytes`, columns of a row it could already
> read). A document is drawn as an icon with its type and size, and every item opens with a URL
> signed at the click, through the vendor link's token for a vendor: images and PDFs in a new tab
> (the vendor's images still in the lightbox), Office files as a download. Every GET now signs
> the row's type as the response `Content-Type`, and `inline` is honoured only for images and PDF;
> anything else, and any type no kind accepts, is `attachment` (`servedAs` in `limits.ts`).
> A fuller rethink of what a board is was deferred on purpose; this is the narrow change.

## Decisions taken here

### Scope

**Couple access is not in this spec; the couple portal is the next `/feature`.** Each board
stores a `shared_with_couple` flag now, which nothing reads until the portal lands. Rejected:
building the couple read path here — it has to solve the `weddings.notes` exposure first
(`0006:270-275`) and covers checklist, timeline, budget and files too, so it would hold the
photographer's link hostage to the whole portal. Cost: a toggle a planner can set that has no
visible effect yet, which the copy says out loud. *(2026-10-01: spec 0008 reads the flag
(`couple_moodboards()`), brings image comments (`file_comments`), and the hint now says the
board shows in the couple's portal.)*

**No comments on images.** Rejected: staff-only comments (little value without the couple) and
vendor comments (the first write by a `link` principal, reversing `0008:87`, with an
unauthenticated writer to defend). Comments arrive with the couple portal, where couple feedback
is their reason to exist.

### Boards

**A wedding has named boards, exactly one of which is the default.** New table `moodboards`.
Every image belongs to exactly one board. Existing images move to the wedding's default board
("Moodboard") in the migration. The default board can be renamed, never deleted, so a wedding
always has somewhere to upload. Rejected: tags on images — sharing "a label" is harder to
explain than sharing a board, and one-image-many-groups was not asked for.

**Deleting a board deletes its images**, after one confirmation naming the count. The images are
soft-deleted exactly as `removeFile` does today, in the same transaction as the board delete.
Rejected: moving them to the default board — it slowly fills with leftovers.

**An image can move between boards** ("Verplaats naar…"), still one board at a time.

### Sharing

**A board is shared per vendor, from the board.** A "Delen" button on the board header opens the
wedding's vendors as a checklist plus the couple toggle; the header shows the current audience
as chips. The vendor sheet lists, read-only, which boards that vendor sees. Rejected: choosing
boards on the vendor sheet — a board's audience would be invisible from the board. Rejected:
one all-vendors switch per board — the florist would see the photographer's board.

**Sharing reaches the vendor only through their link.** No link, no access; a revoked or expired
link stops showing the boards at the next request. Removing a vendor from the wedding removes
its shares (cascade).

**Any planner staff (owner, admin, member) manage and share boards**, the same as the moodboard
today.

### Full timeline

**"Volledige tijdlijn" is a per-vendor setting on `wedding_vendors`, not on the link.** Any planner
staff may switch it; off by default. It lives on `wedding_vendors` because members can write that
table and cannot write `vendor_links` (owner/admin only, `0006:442`) — and because it then
survives a link being replaced. Rejected: a `vendor_links.scope` column, which would make it
owner/admin only.

**With it on, the vendor sees every run-sheet row of the wedding: time, duration, title, place,
and the vendor's name on rows that have one.** Rows with no vendor ("Speeches", "Ceremonie") are
included — that is the point for a photographer. Their own rows are highlighted. Notes,
`owner_user_id` and other vendors' `wedding_vendors.notes` are never shown.

**It is served by a `SECURITY DEFINER` function, not by widening `link_read`.** RLS grants whole
rows. Widening `run_sheet_items.link_read` would hand the link `owner_user_id` on every row, and
reading another vendor's name would need `wedding_vendors.link_read` widened — which exposes the
planner's per-vendor `notes`, the one field that is private per vendor — plus a `vendors` policy
on an `ORG_SCOPED` table whose key the `link` principal does not carry. A function returning
exactly the named columns, gated on the link vendor's `full_run_sheet`, grants nothing else. Same
install guard and `app_user`-only grant as `resolve_vendor_link`. Cost: an eighth `SECURITY DEFINER` function (the second a link calls) that
`tenancy-auditor` must clear, and a column list that has to be changed on purpose. This reverses
the "own rows only" rationale in `0008:52-57` **for vendors the planner opts in**, not by default.

### Images on the vendor page

**Images work for as long as the link does: 5-minute URLs, re-signed on error.** Signed at render
for 5 minutes, as on the planner's board. When a tile fails to load, the page calls a public Server
Function with the link's own token; it re-resolves the link (so a revoked or expired link gets
nothing) and returns fresh URLs for the images still shared. A photographer can keep the page open
all day. Revocation stops the images within 5 minutes. Cost: two small public Server Functions
(refresh, download) that take the token as their only credential. Rejected: a 12-hour lifetime, chosen first and dropped the
same day — `packages/storage/src/limits.ts` already records that a presigned URL dies with the Lambda
role's temporary credentials, so "12 hours" would have been whatever those happen to be, and a copied
URL would outlive a revocation. Rejected: a proxy route (every image through Lambda, S5 rejected it).
Rejected: public image URLs — a couple's photos reachable forever by anyone who copied the address.
The vendor link itself keeps S10's 30-day default and 180-day cap.

**Tap to enlarge, download per image.** Download signs with `Content-Disposition: attachment`,
display signs inline.

**A tile whose image fails to load shows its caption and a download button.** Covers HEIC/AVIF on
an older browser. Uploads are unchanged. Rejected: blocking HEIC uploads (iPhone originals fail)
and converting on upload (new image-processing infrastructure).

## Behaviour

### Planner: `/weddings/[id]/moodboard`

- A board switcher at the top: the boards in `position` order, each with its image count, and
  "+ Nieuw bord". The default board is selected on entry. The selected board is in the URL
  (`?bord=<id>`) so a reload and a shared staff link land on it.
- Board header: name (click to rename, Enter saves, Escape cancels), "Gedeeld met: …" chips or
  "Niet gedeeld", "Delen", "Verwijder bord" (not on the default board), "+ Afbeelding".
- The grid is S5's, scoped to the selected board. Each tile gains "Verplaats naar…" listing the
  other boards (hidden when there is only one).
- **Delen** opens a panel: "Koppel" toggle with the hint that it shows once the couple portal
  exists; then every vendor on the wedding with category, a checkbox each. Vendors without a live
  link are listed, with "nog geen link" — ticking them is allowed, they see it once they get one.
  Saves on each tick. *(Amended at build: the "nog geen link" marker shows only to owner and
  admin. A member cannot read `vendor_links` (0006), so for them "no link" would be a guess; the
  marker is left out rather than shown wrong.)*
- **Delete board**: "Bord en N afbeeldingen verwijderen?" once, inline. Zero images: "Bord
  verwijderen?".

| State | Planner board |
|---|---|
| Only the default board, empty | S5's empty state; switcher shows one board |
| Several boards | Switcher; counts per board |
| Board empty | "Nog geen afbeeldingen op dit bord." + upload |
| No vendors on the wedding | Delen panel: "Nog geen leveranciers voor deze bruiloft." + link to Vendors |
| Error (any write) | Inline, nothing lost, the previous state stays |
| Phone | Switcher becomes a select; Delen is a full-height sheet |

### Planner: vendor sheet (`/weddings/[id]/vendors`)

- New toggle "Volledige tijdlijn tonen" with hint "Deze leverancier ziet de hele dag, niet alleen
  eigen momenten." Any staff.
- Read-only "Moodboards: Fotograaf, Algemeen" or "Geen moodboards gedeeld", each a link to the board.

### Vendor: `/vendor/[token]`

- Timeline section: own rows as today, or with the setting on, the whole day grouped by event,
  own rows highlighted, another vendor's name shown in muted text after the title.
- Below it, one section per shared board, in `position` order: name, then the grid. Tap opens the
  image full-screen with caption and "Download". Nothing shared: the section is absent (not an
  empty state — the vendor does not need to know boards exist).
- Everything else about the page (gone-link screen, no session) is unchanged.

| State | Vendor page |
|---|---|
| No boards shared, own rows only | Today's page, unchanged |
| Full timeline, empty sheet | "Nog niets gepland." |
| Image fails to load | Caption + "Download" tile |
| Page open > 5 min | A failed tile triggers one refresh; tiles swap to fresh URLs silently |
| Link revoked while open | The refresh returns nothing; tiles fall back to caption only |
| Printed | Timeline prints; boards print as a grid with captions |

## Data

**`moodboards`** — new, `TENANT_SCOPED`, FORCE RLS.

| Column | Type | Why |
|---|---|---|
| `id` | uuid, `newId()` | invariant 9 |
| `org_id`, `wedding_id` | uuid not null, wedding cascade | tenant keys |
| `name` | text not null | |
| `is_default` | boolean not null default false | partial unique index `(wedding_id) where is_default` — one per wedding |
| `shared_with_couple` | boolean not null default false | stored now, read by the couple portal |
| `position` | integer not null default 0 | switcher order |
| `created_at`, `updated_at` | | |

**`moodboard_shares`** — new, `TENANT_SCOPED`, FORCE RLS. `(moodboard_id, wedding_vendor_id)`
primary key, `org_id`, `wedding_id`, `created_at`. Both FKs cascade. The share action reads the
board **and** the `wedding_vendors` row under the caller's `withTenant` before inserting — an FK
does not enforce a tenant boundary (`vendors.ts:56-65`).

**`files.moodboard_id`** — uuid, nullable, FK `moodboards` `on delete no action` (the board delete
soft-deletes its images first; a hard cascade would leave S3 objects with no row). *(Amended at
build: `no action`, not the `restrict` first written -- `restrict` is checked mid-statement and
could fail a hard wedding delete that cascades to both `files` and `moodboards`.)* Nullable because
`kind = 'file'` rows have none. Check: `(kind = 'image') = (moodboard_id is not null)`, added after
the backfill.

**`wedding_vendors.full_run_sheet`** — boolean not null default false.

**Migration backfill:** one default board ("Moodboard") per existing wedding; every `kind = 'image'`
row (pending ones too) gets its wedding's default board. `createWedding` creates the default board
in the same transaction.

**Policies (staff):** both new tables get `tenant_isolation` for `owner, admin, member` as a
positive list, never `<> 'couple'` (`0006:209-217`).

**Policies (link):** `for select` only, each naming `app.wedding_id`, each added by name to
`schema-coverage.test.ts`'s exception list.
- `moodboards.link_read`: boards with a share row for `app.wedding_vendor_id`.
- `moodboard_shares.link_read`: rows for `app.wedding_vendor_id`.
- `files.link_read`: `kind = 'image'`, `visibility = 'shared'`, confirmed, not deleted, on a
  board shared with `app.wedding_vendor_id`. The `files` staff policy is untouched. *(Amended at
  build, tenancy audit 2026-09-28: the `visibility` clause, because "moodboard images are always
  shared" is held by the UI only, and a hand-built POST can set `internal`.)*

**Function:** `vendor_link_run_sheet()` — `SECURITY DEFINER`, reads the link GUCs, returns nothing
unless the link's `wedding_vendors.full_run_sheet` is true, otherwise `(id, event_id,
event_label, starts_at, duration_min, title, place, vendor_name, is_own)` for every row of the
wedding, every join pinned to the link's wedding. `app_user` only.

## Permissions

| | owner | admin | member | editor | couple | link |
|---|---|---|---|---|---|---|
| Create/rename/delete board (reorder: not built, see Still open) | ✓ | ✓ | ✓ | — | — | — |
| Share board (vendors, couple flag) | ✓ | ✓ | ✓ | — | — | — |
| Move image between boards | ✓ | ✓ | ✓ | — | — | — |
| Toggle full timeline | ✓ | ✓ | ✓ | — | — | — |
| Read shared boards + images | ✓ | ✓ | ✓ | — | later (portal) | own shares |
| Read full run sheet | ✓ | ✓ | ✓ | — | — | if toggled, named columns |

## Copy

NL first; EN and FR alongside. *(As built: the default name is `DEFAULT_BOARD_NAME` in
`repos/moodboards.ts`, not a message key; `tile.moveTo` landed as `moodboard.moveTo` plus
`moveAria`; the build added `boards.switcher`, `nameField`, `rename`, `shareTitle`, `errors.*` and
`vendorLink.timelineFullTitle` ("De hele dag"), `close`, `openImage`. The catalogues are the
authority.)* Keys under `app.files.moodboard.*` (`messages/app/files.*.json`),
`app.vendors.*` and `app.vendorLink.*`.

| Key | NL | EN |
|---|---|---|
| `boards.new` | + Nieuw bord | + New board |
| `boards.defaultName` | Moodboard | Moodboard |
| `boards.newName` | Nieuw bord | New board |
| `boards.sharedWith` | Gedeeld met: {names} | Shared with: {names} |
| `boards.notShared` | Niet gedeeld | Not shared |
| `boards.share` | Delen | Share |
| `boards.shareCouple` | Koppel | Couple |
| `boards.shareCoupleHint` | Zichtbaar zodra het koppelportaal er is. | Visible once the couple portal is live. *(Changed 2026-10-01, spec 0008: "Zichtbaar in het portaal van het koppel." / "Visible in the couple's portal.")* |
| `boards.shareNoLink` | nog geen link | no link yet |
| `boards.shareNoVendors` | Nog geen leveranciers voor deze bruiloft. | No vendors for this wedding yet. |
| `boards.delete` | Verwijder bord | Delete board |
| `boards.deleteConfirm` | Bord en {count} afbeeldingen verwijderen? | Delete board and {count} images? |
| `boards.deleteConfirmEmpty` | Bord verwijderen? | Delete board? |
| `boards.empty` | Nog geen afbeeldingen op dit bord. | No images on this board yet. |
| `tile.moveTo` | Verplaats naar… | Move to… |
| `vendors.fullRunSheet` | Volledige tijdlijn tonen | Show the full timeline |
| `vendors.fullRunSheetHint` | Deze leverancier ziet de hele dag, niet alleen eigen momenten. | This vendor sees the whole day, not just their own slots. |
| `vendors.boards` | Moodboards: {names} | Moodboards: {names} |
| `vendors.noBoards` | Geen moodboards gedeeld | No moodboards shared |
| `vendorLink.fullEmpty` | Nog niets gepland. | Nothing planned yet. |
| `vendorLink.download` | Download | Download |

FR is translated at build time and reviewed with the rest of `fr`.

## Not in scope

| Not building now | Why, or which phase it belongs to |
|---|---|
| Couple sees boards (or anything) | Couple-portal spec, next `/feature` |
| Comments / reactions on images | With the couple portal |
| Vendor uploads or any `link` write | `0008:87`; would need its own spec |
| Photographer shot list as a feature | Use a board or a planner note; revisit if more photographers ask |
| Pinterest import | Later additive enhancement (research `09:105`) |
| HEIC→JPEG conversion | Fallback tile instead |
| Drag-and-drop reordering of images | Newest first, as S5 |
| Per-row vendor visibility (hide one row from one vendor) | Full or own; revisit on demand |

## Done means

- [x] Migration: `moodboards`, `moodboard_shares`, `files.moodboard_id` + check, `wedding_vendors.full_run_sheet`, backfill, policies, `vendor_link_run_sheet()` — applied locally per `/db-migration`
- [x] Both new tables classified in `schema/index.ts`; `schema-coverage.test.ts` green with the three new `link_read` names listed
- [x] DB tests: a link sees only boards shared with its own vendor; not another vendor's; not after the share is removed; not after revocation; the function returns nothing with the toggle off and never an `owner_user_id` or `notes`; a member can share; a couple principal reads nothing new
- [x] Planner board switcher, CRUD, move, share panel; vendor-sheet toggle and board list
- [x] Vendor page: full timeline, board grids, lightbox, download, fallback tile
- [x] Copy in NL, EN, FR
- [x] `tenancy-auditor` pass clean (after two fixes); assertions mutation-checked by hand
- [x] `npm run check`, `npm run test:db` (local tier), production build

**Still to do:** migration 0012 on the staging Neon branch (the deploy workflow applies it), the
Neon test tier, and a phone check of `/vendor/[token]` on staging -- the screens have not been seen
in a browser yet.

## Still open

- Board order: is `position` edited (drag in the switcher) or just creation order? Creation order
  until someone asks.
