-- Spec 0003, slice S10: the `link` principal. No table changes -- `vendor_links` is 0006's,
-- unchanged -- so this is hand-written only, exactly the shape 0007 is: a SECURITY DEFINER
-- function that is the one door onto a token before any principal exists, plus the RLS a new
-- kind of principal needs. No drizzle-kit snapshot for this migration.
--
-- ===========================================================================
-- Part 0. The design this migration commits to, stated once
-- ===========================================================================
--
-- Spec 0003: "A signed link resolves through a new `link` principal. A SQL SECURITY DEFINER
-- function turns a valid token into (org_id, wedding_id, wedding_vendor_id). The page then
-- runs withTenant as a link principal, and RLS lets it see only that vendor's rows."
--
-- ## Why `app.org_id` stays UNSET for a `link` principal (packages/db/src/tenant.ts)
--
-- Every `tenant_isolation` policy created before this migration -- on `weddings`,
-- `organizations`, `invitations`, `vendors`, all eighteen tables -- starts with
-- `org_id = nullif(current_setting('app.org_id', true), '')::uuid`, and several of them
-- (`weddings`, `organizations`, `invitations`, `wedding_domains`, `audit_log`) carry NO role
-- clause at all, because until now every principal that could reach `withTenant` came from an
-- actual membership row. A `link` principal does not: it is a bearer token with no
-- `org_members` or `wedding_members` row behind it, and `weddings`' own policy would admit it
-- to the WHOLE wedding row -- including `notes`, which is the planner's own (0006's tail
-- names this same column as the couple-portal's open problem, for the identical reason: a
-- `tenant_isolation` policy with no role clause admits whatever principal supplies the
-- matching keys).
--
-- Column-level RLS does not exist in Postgres, so the fix is not "narrow what weddings' policy
-- returns" -- it is "never let a `link` principal's GUCs match that policy's predicate at
-- all". `tenant.ts`'s `withTenant` leaves `app.org_id` unset for this kind, which makes EVERY
-- one of those pre-existing predicates evaluate to NULL and therefore filter every row, with
-- no change to any of them. The two policies below are additive grants on top of that default
-- deny, scoped by `app.wedding_vendor_id` -- a GUC no policy before this migration reads --
-- rather than by the tenant keys at all. `app.wedding_id` IS still set (see tenant.ts), so
-- these two policies can and do name it too, which is what lets them satisfy
-- `schema-coverage.test.ts`'s blanket "every policy on a TENANT_SCOPED_TABLES table names
-- app.wedding_id" rule without weakening anything else.
--
-- The display data the page needs beyond identity (`vendorName`, `orgName` for "Shared with
-- you by...", the wedding's couple names, date, venue, headcount) is therefore NOT read
-- through RLS at all -- there is deliberately no policy admitting `link` to `weddings`,
-- `vendors` or `organizations`. `resolve_vendor_link` below returns it directly, joined as
-- the SECURITY DEFINER owner, the same shape `resolve_invitation` (0007) already uses for
-- `org_name` and `inviter_name`. That is narrower than an RLS grant would be: a `link`
-- principal never gains a query surface on `weddings`, `vendors` or `organizations` at all,
-- present or future, which is the "prefer making a dangerous shape unrepresentable" rule
-- (CLAUDE.md)
-- applied to a principal kind instead of a value.
--
-- ## What gets a policy, and what does not (spec 0003's own instruction, decided narrowly here)
--
--   * `run_sheet_items`: **only rows whose `wedding_vendor_id` matches this link**, not every
--     item of the wedding. The prototype (design-system/planner-prototype, line 1618) is
--     explicit about this being the point: "Absent by design: the other twelve run-sheet
--     rows, every other vendor, the budget, the payment ledger and the guest list." A caterer
--     does not need the florist's slot, and showing it would be the same class of leak as
--     `tasks.visibility` exists to prevent, aimed at a principal with no account at all.
--   * `wedding_vendors`: own row only (`id = app.wedding_vendor_id`), never the wedding's whole
--     vendor list. This is also what carries "what the planner needs from you": `tasks` cannot
--     be assigned to a vendor yet (`schema/tasks.ts`, `TASK_ASSIGNEE_ROLES` -- "arrives with
--     item P18"), so the prototype's dated task list has no table behind it in this build.
--     The one field that exists today, `wedding_vendors.notes`, is what the app renders there:
--     a single freeform block from the planner, not a list. Narrower than the prototype by
--     necessity, not by choice; P18 is what closes the gap honestly.
--   * `wedding_events`: **the whole row of every event of the wedding**, `venue` included --
--     NOT vendor-scoped like the two above, and not one of the two tables spec 0003 names
--     either. It is here because `getVendorLinkView` (vendor-links.ts) inner-joins
--     `run_sheet_items` to `wedding_events` for `eventLabel` ("Ceremony", "Reception"), and
--     with no policy at all that join returns ZERO rows regardless of `run_sheet_items`' own
--     policy -- measured while building this migration: the timeline rendered empty for every
--     link, including a vendor with rows. Because `wedding_events` has no per-event vendor
--     mapping (no table says which vendor is at which event), the policy cannot scope tighter
--     than `wedding_id` without scoping by something that does not exist -- so it grants every
--     event of the wedding to every one of that wedding's link principals, `starts_at` and
--     `venue` and all, not only the `label` and date `getVendorLinkView` happens to select
--     today. This is deliberate, not an oversight: nothing on `wedding_events` today is
--     sensitive in the way `wedding_vendors.notes` or the budget are, so the wider grant was
--     accepted rather than building per-event vendor scoping for a leak that does not yet
--     exist. It is exactly the shape to revisit the day a sensitive column is added to this
--     table (a couple's private note on an event, say) -- see the `link_read on wedding_events`
--     assertions in `planner-isolation.test.ts` for the test that documents this rather than
--     hiding it. `wedding_id` is the only key that means anything for this table.
--   * `budget_lines`: **no policy at all.** Spec 0003 says so explicitly ("money stays
--     planner-only"), and the table's existing `tenant_isolation` policy already excludes
--     `link` the same way every other pre-0008 policy does (no `app.org_id` for this kind) --
--     so "no policy" here is not an oversight, it is the one bucket that needs nothing added.
--   * No table anywhere gets a WRITE policy for `link`. Every policy below is `for select`.
--
-- ## Whether `vendor_links` needs an audit row on each read (spec 0003, "Still open")
--
-- Decided here: no. `resolve_vendor_link` is `stable`, matching `resolve_invitation`, and nothing
-- writes on a read. Revocation (`vendor_links.revoked_at`, already 0006) is the control a
-- planner actually has if a link is shared somewhere it should not be; a per-read log is a new
-- table and a write on every page load for a screen nothing today asks to audit. Revisit if
-- abuse monitoring becomes a real requirement -- this is a build-time call, not a measured one.
--
-- ===========================================================================
-- Part 1. resolve_vendor_link: the one door onto a vendor token before any principal exists.
-- ===========================================================================
--
-- Same shape as 0007's `resolve_invitation`, and the same reasons: `tenant_isolation` on every
-- table involved needs `app.org_id`, which is the thing the token is used to LEARN, so this has
-- to run as the owner, bypassing RLS by design, and refuses to install if the owner cannot.
--
-- Zero rows for a token that matches nothing, INCLUDING one whose `wedding_vendors` row has
-- since been soft-deleted -- removing a vendor from a wedding also disables every link that
-- named it, without a separate revoke. `status` collapses `expired` and `revoked` into
-- something the CALLER can still tell apart (for building an admin view later), but the route
-- that resolves a visitor's token treats every status other than `'live'` identically, same as
-- an unknown token: spec 0003 "never a leak of why".
do $$
begin
  if not exists (
    select 1 from pg_roles
     where rolname = current_user and (rolsuper or rolbypassrls)
  ) then
    raise exception
      'Role % cannot bypass RLS, so resolve_vendor_link would silently find no link for any '
      'token (vendor_links, wedding_vendors and weddings are FORCE ROW LEVEL SECURITY). Apply '
      'migrations as the table owner with BYPASSRLS -- neondb_owner on Neon, postgres locally. '
      'See 0008_vendor_link.sql, Part 1.',
      current_user;
  end if;
end
$$;
--> statement-breakpoint

-- `wedding_date` comes back as `text` (`YYYY-MM-DD`), not `date`: node-postgres's default type
-- parser turns a `date` OID into a JS `Date` at local midnight, which is a UTC-shift bug for
-- anyone west of Greenwich the moment it is formatted -- `packages/db/src/repos/tasks.ts`
-- already carries this exact `weddingDate: string | null` convention for the same reason, and
-- `resolveVendorLinkByHash` (0008's repo file) reads a plain string off this function for
-- exactly that convention, not by accident.
create or replace function public.resolve_vendor_link(p_token_hash text)
returns table (
  org_id uuid,
  wedding_id uuid,
  wedding_vendor_id uuid,
  vendor_name text,
  org_name text,
  wedding_couple_display_name text,
  wedding_date text,
  wedding_venue text,
  wedding_headcount integer,
  status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select vl.org_id,
         vl.wedding_id,
         vl.wedding_vendor_id,
         v.name,
         o.name,
         w.couple_display_name,
         w.wedding_date::text,
         w.venue,
         w.headcount,
         case
           when vl.revoked_at is not null then 'revoked'
           when vl.expires_at <= now() then 'expired'
           else 'live'
         end
    from public.vendor_links vl
    join public.wedding_vendors wv on wv.id = vl.wedding_vendor_id and wv.deleted_at is null
    join public.vendors v on v.id = wv.vendor_id
    join public.weddings w on w.id = vl.wedding_id and w.deleted_at is null
    join public.organizations o on o.id = vl.org_id and o.deleted_at is null
   where vl.token_hash = p_token_hash
$$;
--> statement-breakpoint

revoke all on function public.resolve_vendor_link(text) from public;
--> statement-breakpoint
grant execute on function public.resolve_vendor_link(text) to app_user;
--> statement-breakpoint

-- ===========================================================================
-- Part 2. RLS for the `link` principal: run_sheet_items and wedding_vendors (spec 0003's
-- own two), plus wedding_events (Part 0 explains why that third one had to be added).
-- ===========================================================================
--
-- All `for select`. None names `app.org_id`: see Part 0 for why that is the design and
-- not an omission -- `USER_SCOPED_POLICY_EXCEPTIONS` in schema-coverage.test.ts records the
-- axis each one scopes by instead. All three DO name `app.wedding_id`, which
-- schema-coverage.test.ts requires unconditionally of every policy on a TENANT_SCOPED_TABLES
-- table, and which is real defense in depth here too: `wedding_vendor_id` is a global uuid
-- primary key, but pinning `wedding_id` as well means a bug that mixed up two links, but not
-- their wedding, still cannot cross a wedding boundary. All three name
-- `app.wedding_role = 'link'`, which no other principal ever carries (`withTenant` sets it
-- only for this kind), so none can be satisfied by an owner, admin, member, editor or couple
-- transaction -- it is not what keeps THEM out (they were never admitted to begin with;
-- nothing here changes their policies), it is what stops a future policy on `app.wedding_id`
-- alone from accidentally admitting a link principal to something else.
create policy link_read on "run_sheet_items"
  for select
  using (
    nullif(current_setting('app.wedding_role', true), '') = 'link'
    and wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    and wedding_vendor_id = nullif(current_setting('app.wedding_vendor_id', true), '')::uuid
  );
--> statement-breakpoint

-- Wedding-scoped only, deliberately not vendor-scoped -- Part 0 says why an event has no
-- vendor to scope by. This is the widest of the three: it grants the WHOLE row of every
-- event of the wedding (venue included), not merely the label and date `getVendorLinkView`
-- happens to select today. Still far narrower than the prototype's per-vendor guest counts,
-- and accepted as-is because nothing on `wedding_events` is sensitive yet -- see Part 0.
create policy link_read on "wedding_events"
  for select
  using (
    nullif(current_setting('app.wedding_role', true), '') = 'link'
    and wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
  );
--> statement-breakpoint

create policy link_read on "wedding_vendors"
  for select
  using (
    nullif(current_setting('app.wedding_role', true), '') = 'link'
    and wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    and id = nullif(current_setting('app.wedding_vendor_id', true), '')::uuid
  );
