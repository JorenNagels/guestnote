# Spec 0008 — The couple follows their own wedding, and the planner lets them in

**Date:** 2026-09-30 · **Status:** Specified, not built
**Built so far:** everything below, on 2026-10-01, pending review and the browser pass; the
amendments made during the build are marked *(As built: …)*.
**Phase:** PH1 P7 (couple portal) + P11 (budget, now configurable) + the P21 moodboard comments
spec 0007 deferred · **Bar:** a planner stops sending the couple a spreadsheet export, a
Pinterest link and "did you book the florist yet?" by WhatsApp.

A couple gets their own small portal on the app host: what they have to do, the plan they are
following, their moodboards, the day's timeline, their vendors and, if the planner allows it, the
budget. The planner invites each partner by email from the wedding. That replaces the shared
Excel with the couple's tab, and the WhatsApp group the planner uses to chase them.

## Already settled elsewhere

Accepted as scouted, with no overrides.

| Decision | Where it was already made |
|---|---|
| The couple is a `wedding_members` row, `role = 'couple'`, never an `org_members` row. Two partners means two rows | `schema/weddings.ts:106-121`, `schema/orgs.ts:90-95` |
| One merged `invitations` table; `wedding_id` set means couple or editor; only `token_hash` stored | `schema/orgs.ts:126-165` |
| `accept_invitation` writes `wedding_members` only, checks wedding alive and in the invite's org, email match, `on conflict do nothing` | `migrations/0007_team_read_and_invitations.sql:220-315` |
| `resolve_invitation` computes pending, expired or accepted from the DB clock; revoke deletes the row, so a revoked token reads `unknown` | `0007:147-203` |
| `my_pending_invitations` / `accept_invitation_by_id` already return and accept wedding invites | `0010_studios_and_billing.sql:185-260` |
| Principal has the couple variant `weddingMember {orgId, weddingId, role}`; `app.wedding_id` mandatory | `packages/core/src/auth/types.ts:134-140`, `packages/db/src/tenant.ts:67-74` |
| Couples read shared tasks and comments, never internal; a trigger keeps comment visibility in step | `0001_rls.sql:196-346`, `schema/tasks.ts:93-105` |
| Every PH2+ table admits a positive staff list only; opening one is a migration | `0006_planner_tables.sql:199-217` |
| A couple reads a task's stored `due_at`, never its anchor | spec `0004:76-80` |
| `moodboards.shared_with_couple` exists, default false, unread until now | `schema/moodboards.ts:42` |
| The portal is on the `app.` host (the reason for the pro→app rename) | `packages/core/src/hosts.ts:103`, `README.md:128` |
| No magic links | `PRODUCT.md:140-142` |
| Couples keep reads *and* writes after the studio's trial ends, and never count as a seat | spec `0005:91-94,158,447` |
| The guest site on `<slug>.` is separate work | `app/sites/[tenant]/[[...slug]]/page.tsx` |

## Decisions taken here

### Scope

**All five modules ship in v1: tasks with comments, moodboards, run sheet, vendors, budget with
payments.** Research `09:203-209` proposed the same set minus moodboards. The cost is five read
paths and one migration that touches most of the planner tables' neighbourhood. Rejected: a
tasks-only first cut, which would have shipped a portal the couple has no reason to open twice.

**The couple can upload images into, and comment on, the moodboards shared with them.** Spec
0007 deferred image comments "to the couple portal". This is it.

**Out of scope:** the couple creating tasks, and the guest list / RSVP (see *Not in scope*).

### Visibility

**Each wedding has five module switches, all on by default, for existing and new weddings.**
Stored as `weddings.couple_modules`. Enforced in the database, not only hidden in the UI: every
couple read path checks the switch (see *Read path*). Rejected: toggling budget alone (the
planner call on 2026-09-24 asked for configurability in general), and per-row visibility on
every table (too many planner clicks, too big a migration). Also rejected, as the recommended
default: budget off. **The cost of "all on":** budget, payments and the whole run sheet of every
existing wedding are visible to the couple the moment they accept. The planner call's own
wording ("configurable couple visibility", memory note 2026-09-24) reverses P11's "budget fully
shared" as a *fixed* rule; the default stays with research `09:88`.

**`tasks.visibility` and `files.visibility` keep their `'shared'` default, with no backfill.**
Rejected: flipping the default to `internal` and backfilling existing rows to `internal`. That was
the recommendation, because every task a planner has already made becomes couple-visible on the
day the couple accepts, and `PRODUCT.md:225` calls that leak "the failure that ends the trust".
Chosen anyway: the planner has always seen the Shared/Internal control on the task, and a
backfill to internal would empty every live couple's checklist on day one. **Mitigation, not a
mechanism:** the invite card on the wedding overview states how many shared tasks the couple will
see, with a link to the task list, before the planner presses send (see *Copy*).

**Moodboards stay per-board:** the `moodboards` switch opens the module, and each board still
needs `shared_with_couple` on. A board the planner never shared stays invisible.

### Checklist

**The couple sees the whole shared plan, with their own tasks on top under "Voor jullie".**
"Their own" means `assignee_role = 'couple'` or `assignee_user_id` is either partner. No
per-wedding "assigned only" mode. Rejected: that mode (one more switch for a need nobody has
reported yet) and assigned-only as the only view (it hides the plan the couple is paying for).

### What the couple can write

**The couple can tick their own tasks, comment on any shared task, comment on images in shared
boards, upload images to shared boards, and delete their own uploads and comments.** They cannot
create, rename, re-date or delete a task, or tick a task that isn't theirs.

**Every couple write goes through a `SECURITY DEFINER` function, and the couple's existing
`FOR ALL` policy on `tasks` and `task_comments` narrows to `FOR SELECT`.** RLS cannot restrict
columns: a couple allowed to `UPDATE` a task row to tick it could also rename it. Today the
policy lets a couple insert, update or delete *any* shared task (`0001_rls.sql:196-220`). That was
harmless while no couple could sign in, and it would not be harmless once one can. Each function
checks, before writing, that the wedding is `live`, that the module switch is on, and that the
row is the couple's to touch. Rejected: narrower RLS write policies. They would need a trigger
to freeze the other columns, and a comment on "who may tick" would then be spread over a policy,
a trigger and the app.

### Read path

**Couple reads of PH2+ tables go through `SECURITY DEFINER` functions that return named columns
only.** This follows the `vendor_link_run_sheet()` precedent (`0012`). Functions:
`couple_home()`, `couple_run_sheet()`, `couple_vendors()`, `couple_budget()` and
`couple_moodboards()`. Each takes no wedding argument, reads `app.user_id` and `app.wedding_id`,
checks that a `couple` membership for that pair exists, and checks the module switch. RLS on
`wedding_events`, `run_sheet_items`, `wedding_vendors`, `vendors`, `budget_lines`, `payments`,
`moodboards`, `files` and the new `file_comments` gains **no couple policy**. Tasks and task
comments keep reading through their existing RLS, with the `tasks` switch added to the couple
clause.

This settles the `weddings.notes` question left open at `schema/weddings.ts:52-59` and spec
`0007:37`. The portal never selects from `weddings` directly. `couple_home()` returns the display
name, date, venue, status, locale, `couple_modules`, the studio name and the planner contact, and
never `notes`. `wedding_vendors.notes` and `vendors.notes` are handled the same way.
*(As built: this was written down as a convention -- "the existing `tenant_isolation` still lets a
couple principal select its whole `weddings` row" -- and became a wall. Migration 0013 gave
`weddings` the staff role clause (see "What 0013 closes" below), so a couple principal reads no
`weddings` row at all, `notes` included. `getWedding` and `listWeddings` now answer a couple with
nothing, and the portal's own `orgId` comes from `my_couple_weddings()`.)*

Rejected: opening RLS and revoking the `notes` columns. `app_user` is the planner's role too, so
the revoke would hide `notes` from staff. Also rejected: moving the notes columns to staff-only
side tables. That is cleaner long term, but it is the largest migration and data move, and it
has to be repeated for every future sensitive column.

**The couple's `orgId` comes from `couple_home()` too.** `my_couple_weddings()` returns wedding
id, org id, display name and status for the caller's `couple` memberships. It closes the gap
named at `repos/memberships.ts:191-195` as of 2026-09-30, which the code called "P7's problem" (that comment now points at `couplePrincipalFor`). Rejected: adding
`org_id` to `wedding_members`, a column that duplicates `weddings.org_id` and must be kept in step.

### What 0013 closes

**Every policy a couple principal could have written through gets the staff role clause, and the
membership tables become read-only for their own user.** Found while writing the migration, and
decided with the user on 2026-10-01. Until this spec no couple could sign in, so a policy with no
role clause was harmless; once one can, a couple could have renamed the studio or moved its trial
(`organizations`), switched their own modules or status (`weddings`), invited an `editor` to their
own wedding and so read every internal task (`invitations`), and written `wedding_domains` and
`audit_log`. Separately, `own_memberships` was `for all` on `user_id` alone, so any signed-in user
could insert a membership for themselves on any id. None of this was reachable from the app -- no
Server Function made those writes -- but RLS is the backstop for the day that stops being true.

- `organizations`, `weddings`: `in ('owner','admin','member','editor')`.
- `invitations`, `wedding_domains`, `audit_log`: `in ('owner','admin','member')` -- an outside
  editor inviting people is a grant nobody decided on.
- `tasks`, `task_comments`: the same staff list for `for all`, plus a `couple_read` `for select`.
- `org_members`, `wedding_members`: `own_memberships` is `for select`. Every membership write was a
  SECURITY DEFINER function already (`accept_invitation`, `create_studio`), and
  `remove_wedding_couple` joins them. The dev seed now joins its member and couple by invitation.

Rejected: closing only the couple-reachable five and leaving `own_memberships` for later -- the
membership hole is the wider one. Rejected: recording the holes and building the portal on top.
Cost: `schema-coverage.test.ts`'s `PREDATES_ROLE_CLAUSE` exemption is now empty, and a handful of
isolation tests that pinned the old behaviour (an unset role reading shared tasks; a couple
reading its own invitation and audit rows; a couple writing a shared task) were rewritten to the
new one, each saying so.

### Surface

**The portal is its own route group on the app host: `app.guestnote.be/w/<weddingId>`.** It is
phone-first, holds one wedding, and has no org navigation. It is a single column: a header with
the studio name, the couple's names and the date, then the enabled modules as a list.
**Rejected:** reusing the planner's `(app)` shell with items hidden by role. Every future planner
screen would have to remember the couple case, and a couple who signs in six times a year
(`PRODUCT.md:34`) should not land in a planner tool with things greyed out. This also decides
`PRODUCT.md:146`.

*(As built: the module pages are `/w/<id>/planning`, `/moodboards`, `/moodboards/<boardId>`,
`/day`, `/vendors`, `/budget` -- English and short, since a couple rarely reads a URL and never
types one; `/w` is the picker. `/w` and not `/weddings`, so a link pasted between a planner and a
couple never means two screens by role.)*

A signed-in user whose only membership is `couple` lands on `/w/<id>` from `/`. With two
couple memberships (rare, but possible), they land on a picker. A user who is both staff and
couple sees the planner app, with a "Jouw trouw" link in the account menu.

### Sign-in

**The same stack as the planner: a six-digit email code, with a passkey offered after the first
sign-in and never required.** Rejected: code-only (hides a better experience for the partner who
would take it), and a long-lived 90-day session (a bigger window on a stolen or shared device, for
a login that happens six times a year).

### Inviting

**Who:** owner, admin, and the staff member assigned to this wedding (`wedding_members.role =
'editor'`). Spec `0003:148` gives members no staff-invite rights; this is a separate right, scoped
to one wedding. Rejected: owner and admin only, which makes the planner running the wedding ask
the owner.

**Where:** a "Koppel uitnodigen" card on the wedding overview while no partner has accepted, and
a "Koppel" section in wedding settings that lists partners, pending invites, resend and remove.
*(As built: settings also carries the invite card while fewer than two partners have access or a
live invite, so the second partner can be invited after the first accepted and the overview's
card is gone.)*
Rejected: invites at wedding creation, because planners often create the wedding before the
couple has signed.

**Two email fields, one invite each.** The second is optional. Each partner gets their own
account and sign-in, which is what makes "who ticked this" and passkeys work. Rejected: a shared
login.

**A failed mail keeps the invite.** *(Decided during the build.)* Staff invites take the row back
when the mail fails, so a retry is not refused as a duplicate. Here the planner sees the pending
invite with "Opnieuw versturen" beside it and a resend issues a fresh token, so keeping the row
costs nothing and tells the truth about who was invited.

**A staff member of the studio cannot be invited as the couple**, and neither can an existing
partner: `couple_invite_blocker` says which, because an assigned member cannot read
`org_members` or other users' `wedding_members` rows to check for itself.

**Invites last 30 days and can be resent.** A resend deletes the old row (its token then reads
`unknown`) and issues a new one. Rejected: 7 days like staff invites (`lib/invite-token.ts:5`),
too short for someone who reads the mail a week later. Also rejected: expiry at the wedding
date, which lets a stale token live for a year.

**The mail uses the wedding's `locale_default` and is sent in the studio's name, with no logo.**
Rejected: the inviter's locale (the staff precedent at `lib/invite-mail.ts:24-28`), which sends a
French-speaking couple Dutch. Also rejected: the studio logo, still deferred by spec `0005:518`.

**Removing a partner:** owner, admin or the assigned editor can revoke a pending invite (row
delete, the existing mechanism) or remove an accepted partner through a new `SECURITY DEFINER`
`remove_wedding_couple(wedding_id, user_id)`. It deletes only `role = 'couple'` rows of a wedding
in the caller's org. It exists because `own_memberships` only lets a user delete their own row
(`0007:54-56`). It covers a mistyped email, the wrong person and a break-up.

### Wedding status

**`draft`: the portal is closed. `live`: fully open. `archived`: read-only.** A couple who
accepts an invite to a draft wedding sees a single screen: "<Studio> zet jullie portaal nog
klaar." Nothing is refused and the invite is used. Writes on an archived wedding are refused in
the definer functions. Rejected: ignoring status, and closing archived weddings, which takes the
couple's own memories away the day after.

### Planner notification

**In-app only: an unread dot on tasks and images with new couple activity.** Two columns per
subject: `couple_activity_at`, set by the couple write functions, and `staff_seen_at`, set when
any staff member opens the task or image. *(As built: the task page clears it on render, a write on
a GET like the invite page's accept; an image clears when its comment thread is opened.)* The dot shows while `couple_activity_at >
coalesce(staff_seen_at, '-infinity')`. The marker is **shared by the team**, not per person.
Rejected: a per-user read-state table, which spec `0003:87,199` says needs a measurement first for
`member`. Also rejected: an email per comment (noise and a preferences screen), and nothing at
all. Cost: when one planner opens a task, it clears the dot for their colleague too.

### Found by the tenancy audit, 2026-10-01

**A `couple` row is never a staff assignment.** A partner who later joins the studio as a
`member` kept their `couple` row, which `principalForWedding` read as an assignment -- handing
them their own wedding's notes and internal tasks. Only an `editor` row assigns now, in
`principalForWedding`, the team list and the run-sheet owner list. **An outside editor does not
write the studio row** (`organizations` admits owner, admin, member). **A deleted studio closes
its couples' portals.** And, noted rather than changed: an image the couple uploads to a board
that is also shared with a vendor is on that vendor's link at once -- the board is the audience,
whoever added the image.

## Behaviour

### Planner: wedding overview, invite card

- **No partner invited:** the card has two email fields ("Partner 1", "Partner 2 (optioneel)"),
  the line "Ze zien {n} gedeelde taken" linking to the task list, and "Uitnodiging versturen".
- **Invited, none accepted:** the card lists each email with "Uitgenodigd op {date}" and
  "Opnieuw versturen". It disappears once one partner accepts.
- **Error:** the address is invalid, the address is a staff member of this org (refused, because
  a staff member already sees everything), or the address is already a partner or pending on this
  wedding (refused, and the existing row is named). If the mail fails to send, the invite still
  exists and the card shows "Mail niet verstuurd — opnieuw proberen".
- The trial guard applies: sending, resending and removing are staff writes (`assertWritable`).

### Planner: wedding settings, "Koppel" section

- Five switches, one per module, each with a one-line explanation. Changes save immediately and
  are announced ("Opgeslagen") through a live region; a failed save flips the switch back and
  says so.
- The partners list shows accepted partners (name, email, "Verwijderen"), pending invites
  (email, sent date, expiry, "Opnieuw versturen", "Intrekken") and expired invites ("Verlopen",
  "Opnieuw versturen").
- Remove and revoke ask for one confirmation that names the email.

### Planner: tasks and moodboard

- A dot appears on a task row or an image thumbnail when there is unread couple activity.
  Opening the task or image clears it.
- A comment by a couple member carries a "Koppel" chip, and an image uploaded by the couple
  carries "Toegevoegd door {name}".
- A moodboard image gets a comment thread (staff and couple). It never appears on the vendor
  link.

### Couple: invite link

`/invite/<token>` resolves a `wedding` outcome and no longer blocks with `inviteCouple`. The
screen shows "{Studio} nodigt jullie uit voor de planning van {couple}." and the email field
locked to the invited address. Signing in or up runs the same code-then-optional-passkey flow;
accepting the invite then redirects to `/w/<id>`. The existing expired, accepted, unknown and
wrong-account outcomes are unchanged. No studio-terms step: the couple is not a customer (see
*Still open*).

### Couple: portal home `/w/<id>`

- **Nothing shared yet** (no shared tasks, no shared boards, and no run sheet, vendors or budget
  rows): "Welkom, {couple}. {Studio} zet hier binnenkort jullie planning klaar." followed by the
  planner contact (the assigned editor's name and email, or the org owner's if none). The
  navigation shows only enabled modules.
- **Normal:** the header, then "Voor jullie" (open couple tasks, due date first, at most 5 plus
  "Alle taken"), then links to each enabled module with a count.
- **Draft wedding:** the single "portaal nog klaar" screen.
- **Archived:** a banner reading "Deze trouw is afgesloten. Je kan alles nog bekijken."; tick,
  comment and upload controls are hidden.
- **Loading:** a skeleton of the header and list, not a spinner.
- **Error or no signal:** "Laden lukt niet. Probeer opnieuw." with a retry control. Nothing is
  written optimistically without a visible failed state: a tick that fails reverts and says so.

### Couple: modules

- **Planning:** every shared task grouped by month, "Voor jullie" first. Only the couple's own
  tasks have a checkbox. Each task opens a comment thread. Three hundred tasks: grouped by month.
  *(As built: nothing collapses. On a phone a scroll is cheaper than a tap per month; revisit if a
  real plan says otherwise.)*
- **Moodboards:** a list of shared boards, then a board's image grid. The couple can upload
  (the same types and 25 MiB limit as the planner, `packages/storage/src/limits.ts`), open an
  image with its comment thread, and delete images they uploaded. An empty shared board shows
  "Nog geen beelden. Voeg er zelf toe."
- **Draaiboek:** the whole day, every item, grouped by event. Columns are time, duration, title,
  place and vendor name. Read-only. It prints to paper as a plain table (`@media print`), for
  the venue with no signal.
- **Leveranciers:** name and category only, booked vendors only (`wedding_vendors.status =
  'booked'`, one of `WEDDING_VENDOR_STATUSES` in `schema/vendors.ts:41-47`), with no contact details and no
  notes. The planner stays the single point of contact. Rejected: showing email and phone (the
  recommendation), and showing vendors still under consideration.
- **Budget:** read-only lines (category, label, estimate, actual) with totals, plus the payment
  schedule (due date, amount, paid or not). One switch covers both. Rejected: category totals
  only, and separate budget and payment switches.

A module switched off is absent from the navigation, and its URL returns the portal's 404.

### Density and phone

The portal is phone-first and must hold at 360px. `[data-density="compact"]` is a planner
setting; the portal ignores it.

## Data

Migration `0013`:

| Change | Nullability, and why |
|---|---|
| `weddings.couple_modules text[] not null default array['tasks','moodboards','run_sheet','vendors','budget']`, CHECK each element is one of those five | not null: absence has to mean something, and "all" is the chosen default. An array rather than five booleans, so a sixth module is a CHECK change rather than a column |
| `tasks.couple_activity_at`, `tasks.staff_seen_at` (`timestamptz`) | nullable: most tasks never see couple activity |
| `files.couple_activity_at`, `files.staff_seen_at` | same |
| New table `file_comments (id, org_id, wedding_id, file_id → files, author_user_id → users set null, body, created_at, updated_at, deleted_at)` | tenant bucket; FORCE RLS; staff policy (positive list owner/admin/member); **no couple policy**, couple access is through the functions |
| `tasks`, `task_comments`: couple clause narrowed to `FOR SELECT` and gated on `gn_couple_module_open('tasks')` (live or archived wedding, switch on) | a positive role list, never `<> 'couple'` |
| Role clause on `organizations`, `weddings`, `invitations`, `wedding_domains`, `audit_log`; `own_memberships` `for select` | see "What 0013 closes" |
| `resolve_invitation` gains `wedding_name` | the couple's landing screen names the wedding; dropped and recreated, a new signature |
| `gn_task_comment_inherit`, `gn_task_visibility_propagate` pin `search_path = public, pg_temp` | they named `tasks` unqualified, and failed under a definer caller's empty path -- measured 2026-10-01 on the first couple comment |

An `assignedStaff` principal, pinned to its wedding, can insert and delete invites for that wedding
and no other under `invitations`' policy. Who may invite a couple (owner, admin, assigned member)
is checked in application code before the insert, as for staff invites (`repos/team.ts:170`).

New `SECURITY DEFINER` functions, each with the install guard, `search_path = ''`, revoked from
public and granted to `app_user` only (`0007:117-165`):

- Reads: `my_couple_weddings()`, `couple_home()` (which also returns both partners' ids),
  `couple_run_sheet()`, `couple_vendors()`, `couple_budget_lines()`, `couple_payments()`,
  `couple_moodboards()`, `couple_board_images(moodboard_id)`, `couple_file_comments(file_id)`.
- Couple writes: `couple_set_task_done(task_id, done)`, `couple_add_task_comment(id, task_id,
  body)`, `couple_delete_task_comment(id)`, `couple_start_image(id, moodboard_id, name,
  storage_key, size_bytes, mime)`, `couple_confirm_image(id)`, `couple_delete_image(id)`,
  `couple_add_file_comment(id, file_id, body)`, `couple_delete_file_comment(id)`.
- Staff: `remove_wedding_couple(wedding_id, user_id)`, `wedding_couple_members(wedding_id)`,
  `couple_invite_blocker(wedding_id, email)`.
- Internal, not granted: `gn_couple_wedding()`, `gn_couple_image(file_id)`,
  `gn_can_manage_couple(wedding_id)`. `gn_couple_module_open(module)` is granted, because
  `couple_read` calls it from a policy.

Couple uploads use the existing presigned PUT, the moodboard's two steps: the Server Function
presigns into `<orgId>/<weddingId>/<fileId>`, `couple_start_image` writes the hidden row (and
refuses a key that is not exactly that), `couple_confirm_image` makes it live.

`audit_log`: **nothing writes to it today** (checked 2026-09-30), and since 0013 a couple reads
none of it. Whoever adds the first writer decides whether a couple should see any.

## Permissions

| | owner | admin | member | editor (assigned staff) | couple |
|---|---|---|---|---|---|
| Invite, resend or revoke a couple invite | ✅ | ✅ | ❌ | ✅ own wedding | ❌ |
| Remove an accepted partner | ✅ | ✅ | ❌ | ✅ own wedding | ❌ |
| Set module switches | ✅ | ✅ | ❌ | ✅ own wedding | ❌ |
| See unread couple activity | ✅ | ✅ | ✅ assigned | ✅ | — |
| Read shared tasks and comments | ✅ | ✅ | ✅ | ✅ | ✅ if `tasks` on |
| Tick a task | ✅ | ✅ | ✅ | ✅ | own tasks only, `live` only |
| Comment on a shared task | ✅ | ✅ | ✅ | ✅ | ✅, delete own |
| Read the run sheet, vendors and budget | ✅ | ✅ | ✅ | ✅ | named columns, if switched on |
| Shared moodboards: read, upload, comment | ✅ | ✅ | ✅ | ✅ | ✅ `shared_with_couple` boards; delete own |
| After the studio's trial ends | reads only | reads only | reads only | reads only | unchanged |

## Copy

NL first; EN and FR alongside. *(As built: the portal and planner copy is one slice file,
`apps/web/messages/app/couple.{nl,en,fr}.json`, under `app.couple.portal.*` and
`app.couple.planner.*` -- the table's `couple.*` and `wedding.couple.*` read as those two. Mail copy
is `email.coupleInvite.*` and the landing line `auth.invite.couple`, both in the base catalogues;
`auth.errors.inviteCouple` and `app.signup.invited.couplePortal` are removed. `nav.myWedding` is
`app.shell.myWedding`; the unread dot's words and the comment chip are `app.tasks.row.coupleUnread`
and `app.tasks.comments.couple`. The comment link's count is three keys, `commentsNone`,
`commentsOne`, `commentsOther`, because the client has no ICU formatter.)*

| Key | NL |
|---|---|
| `wedding.couple.cardTitle` | Koppel uitnodigen |
| `wedding.couple.partner1` / `partner2` | Partner 1 / Partner 2 (optioneel) |
| `wedding.couple.sharedCount` | Ze zien {n, plural, one {# gedeelde taak} other {# gedeelde taken}} |
| `wedding.couple.send` | Uitnodiging versturen |
| `wedding.couple.invitedOn` | Uitgenodigd op {date} |
| `wedding.couple.resend` / `revoke` / `remove` | Opnieuw versturen / Intrekken / Verwijderen |
| `wedding.couple.expired` | Verlopen |
| `wedding.couple.mailFailed` | Mail niet verstuurd — opnieuw proberen |
| `wedding.couple.errStaff` | Dit adres hoort bij je team. Teamleden zien de trouw al. |
| `wedding.couple.errExists` | {email} is al uitgenodigd voor deze trouw. |
| `wedding.couple.confirmRemove` | {email} heeft dan geen toegang meer tot het portaal. |
| `wedding.couple.settingsTitle` | Wat het koppel ziet |
| `wedding.couple.module.tasks` | Planning — gedeelde taken en reacties |
| `wedding.couple.module.moodboards` | Moodboards — alleen borden die je deelt |
| `wedding.couple.module.run_sheet` | Draaiboek — de hele dag |
| `wedding.couple.module.vendors` | Leveranciers — naam en categorie |
| `wedding.couple.module.budget` | Budget — posten en betalingen |
| `wedding.couple.chip` | Koppel |
| `wedding.couple.addedBy` | Toegevoegd door {name} |
| `auth.invite.couple` | {studio} nodigt jullie uit voor de planning van {couple}. |
| `couple.welcome` | Welkom, {couple}. {studio} zet hier binnenkort jullie planning klaar. |
| `couple.draft` | {studio} zet jullie portaal nog klaar. |
| `couple.archived` | Deze trouw is afgesloten. Je kan alles nog bekijken. |
| `couple.forYou` | Voor jullie |
| `couple.allTasks` | Alle taken |
| `couple.nav.tasks` / `moodboards` / `runSheet` / `vendors` / `budget` | Planning / Moodboards / Draaiboek / Leveranciers / Budget |
| `couple.contact` | Vragen? Contacteer {name} — {email} |
| `couple.boardEmpty` | Nog geen beelden. Voeg er zelf toe. |
| `couple.loadError` | Laden lukt niet. Probeer opnieuw. |
| `couple.tickFailed` | Afvinken lukte niet. Probeer opnieuw. |
| `couple.pick` | Welke trouw wil je openen? |
| `nav.myWedding` | Jouw trouw |
| `email.coupleInvite.subject` | {studio} nodigt jullie uit voor jullie trouwplanning |
| `email.coupleInvite.body` | {inviter} van {studio} heeft een plek klaargezet waar jullie de planning van jullie trouw volgen: wat jullie nog moeten doen, het draaiboek en jullie moodboards. |
| `email.coupleInvite.cta` | Open jullie portaal |
| `email.coupleInvite.expiry` | Deze uitnodiging is 30 dagen geldig. |

## Not in scope

| Not building now | Why, or which phase it belongs to |
|---|---|
| The couple creating tasks | decided here; the planner owns the plan |
| Guest list, RSVP, guest site on `<slug>.` | separate feature and host |
| A per-wedding "assigned tasks only" checklist mode | rejected above; revisit if a planner asks |
| Per-row visibility on the run sheet, budget or vendors | module switches instead |
| Studio logo in the portal and invite mail | still deferred by spec `0005:518` |
| Email notifications to the planner | in-app dot only; digests later |
| Per-user unread state | needs spec 0003's measurement first |
| Vendor contact details for the couple | decided here |
| A shared files area (contracts, documents) for the couple | moodboard uploads only |
| Tenant theming of the portal | `design-system/` parks it |

## Done means

- [ ] Migration `0013` applied locally and on the staging Neon branch; schema buckets classify
      `file_comments`; `schema-coverage.test.ts` green.
- [ ] Isolation tests (db tier): a couple principal cannot read `weddings.notes` through any
      portal function; cannot read any PH2+ table directly; cannot tick a task not assigned to
      them; cannot write on a draft or archived wedding; gets nothing from a switched-off module;
      cannot see an unshared board or an internal file; cannot remove another partner. An editor
      of wedding A cannot invite, or remove, on wedding B.
- [ ] A test proving that accepting a couple invite never writes `org_members`.
- [ ] The trial guard covers the new staff Server Functions; the portal's couple Server
      Functions are outside `app/pro/(app)/` and stay writable.
- [ ] Invite mail is built from `@react-email/render` and `layout.tsx` (invariant 11), in the
      wedding's locale.
- [ ] NL, EN and FR copy complete; `auth.errors.inviteCouple` removed.
- [ ] The portal works at 360px, and the run sheet prints.
- [ ] Assertions mutation-checked (`mutation-tester`), `tenancy-auditor` run on the diff.
- [ ] `npm run check`, `npm run test:db` (both tiers), `npm run build -w @guestnote/web`, plus
      whatever `/verify` names for a new route group and new mail.
- [ ] End to end on staging: invite two partners, accept both, one ticks and comments, the
      planner sees the dot, the planner switches budget off, and the couple loses it.

## Still open

- **Terms and privacy for the couple.** No studio-terms step is planned, because the couple is
  not Guestnote's customer. Whether the couple must acknowledge a privacy notice on first sign-in
  (GDPR: they are data subjects of both the studio and Guestnote) is a legal question, not a
  product one.
