-- Spec 0007: named moodboards, shared per vendor through the signed link, and a per-vendor
-- "full timeline" on that link. Generated DDL first (drizzle-kit), then by hand: the backfill,
-- the check it makes possible, RLS and grants, and one SECURITY DEFINER function.
--
-- ===========================================================================
-- Part 0. What a `link` principal gains here, and what it deliberately does not
-- ===========================================================================
--
-- 0008 Part 0 is the frame: a `link` principal has `app.wedding_id` and `app.wedding_vendor_id`
-- and NO `app.org_id`, so every pre-existing `tenant_isolation` predicate filters it out, and
-- each grant to it is an additive, `for select`, vendor-scoped policy. This migration adds three
-- of those and no write for `link` anywhere:
--
--   * `moodboard_shares.link_read`: the link's own share rows.
--   * `moodboards.link_read`: boards with a share row for the link's vendor.
--   * `files.link_read`: `kind = 'image'`, live (not deleted, not pending), on such a board.
--
-- Each is ORed with the table's `tenant_isolation` (Postgres ORs permissive policies). Every one
-- starts with `app.wedding_role = 'link'`, which no staff or couple principal ever carries, so
-- inside a staff transaction each contributes nothing -- the guard `db-migration` 4b asks for.
-- The pending-upload convention (`deleted_at = created_at`, repos/files.ts) is covered by
-- `deleted_at is null`: a pending row has a non-null `deleted_at`.
--
-- ## The full run sheet is a function, not a wider policy
--
-- A vendor with `wedding_vendors.full_run_sheet` sees every run-sheet row of the wedding, and
-- the name of the vendor on each. Doing that with RLS would mean:
--   * widening `run_sheet_items.link_read` to the whole wedding -- a whole-row grant, so every
--     row's `owner_user_id` (spec 0004 decided the link never shows it) comes with it;
--   * widening `wedding_vendors.link_read` to every vendor of the wedding for the names --
--     which hands the link every OTHER vendor's `notes`, the planner's private note to each;
--   * a `vendors` policy for `link`, on an ORG_SCOPED table whose key this principal lacks.
-- Column-level RLS does not exist. So `vendor_link_run_sheet()` returns exactly the columns the
-- page draws, as the owner, the same shape `resolve_vendor_link` uses for the display data it
-- returns. Cost: an eighth SECURITY DEFINER function (the second a `link` principal calls), and a column list that has to be widened on
-- purpose. Rejected: the three policy changes above.
--
-- It takes NO arguments. It reads the link GUCs `withTenant` set, exactly as the RLS policies do,
-- so a caller cannot ask for another vendor's view by passing an id. And it re-checks nothing
-- about revocation, for the same reason the policies do not: a `link` principal is rebuilt from
-- `resolve_vendor_link` on every request (tenant.ts).

CREATE TABLE "moodboard_shares" (
	"moodboard_id" uuid NOT NULL,
	"wedding_vendor_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"wedding_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "moodboard_shares_moodboard_id_wedding_vendor_id_pk" PRIMARY KEY("moodboard_id","wedding_vendor_id")
);
--> statement-breakpoint
CREATE TABLE "moodboards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"wedding_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"shared_with_couple" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "moodboard_id" uuid;--> statement-breakpoint
ALTER TABLE "wedding_vendors" ADD COLUMN "full_run_sheet" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "moodboard_shares" ADD CONSTRAINT "moodboard_shares_moodboard_id_moodboards_id_fk" FOREIGN KEY ("moodboard_id") REFERENCES "public"."moodboards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moodboard_shares" ADD CONSTRAINT "moodboard_shares_wedding_vendor_id_wedding_vendors_id_fk" FOREIGN KEY ("wedding_vendor_id") REFERENCES "public"."wedding_vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moodboard_shares" ADD CONSTRAINT "moodboard_shares_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moodboards" ADD CONSTRAINT "moodboards_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "moodboard_shares_org_wedding_vendor_idx" ON "moodboard_shares" USING btree ("org_id","wedding_id","wedding_vendor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "moodboards_one_default_per_wedding" ON "moodboards" USING btree ("wedding_id") WHERE is_default;--> statement-breakpoint
CREATE INDEX "moodboards_org_wedding_idx" ON "moodboards" USING btree ("org_id","wedding_id","position");--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_moodboard_id_moodboards_id_fk" FOREIGN KEY ("moodboard_id") REFERENCES "public"."moodboards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "files_moodboard_idx" ON "files" USING btree ("moodboard_id");--> statement-breakpoint

-- ===========================================================================
-- Part 1. Backfill: every wedding gets its default board, every image goes on it.
-- ===========================================================================
--
-- Every wedding, soft-deleted ones included: a restored wedding must not come back boardless,
-- and `createWedding` makes one from here on. `gen_random_uuid()` is a v4, not the app's v7
-- (invariant 9): the only property that matters for an id is `uuid`, which every policy casts
-- to, and a backfill has no application to call `newId()` from. A v4 id carries no time, so it
-- sorts anywhere among v7 ids; nothing orders boards by id -- `listBoards` sorts on `position`,
-- then `created_at`.
insert into "moodboards" (id, org_id, wedding_id, name, is_default, position)
select gen_random_uuid(), w.org_id, w.id, 'Moodboard', true, 0
  from "weddings" w
 where not exists (select 1 from "moodboards" m where m.wedding_id = w.id and m.is_default);
--> statement-breakpoint

-- Pending rows too (`deleted_at = created_at`): a confirm after this migration must land on a
-- board, and the check below would refuse the row otherwise.
update "files" f
   set moodboard_id = m.id
  from "moodboards" m
 where m.wedding_id = f.wedding_id
   and m.is_default
   and f.kind = 'image'
   and f.moodboard_id is null;
--> statement-breakpoint

ALTER TABLE "files" ADD CONSTRAINT "files_moodboard_kind_check" CHECK ((kind = 'image') = (moodboard_id is not null));
--> statement-breakpoint

-- ===========================================================================
-- Part 2. RLS. Enable AND force (ENABLE alone exempts the owner; see 0001).
-- ===========================================================================
alter table "moodboards"       enable row level security;
alter table "moodboards"       force  row level security;
alter table "moodboard_shares" enable row level security;
alter table "moodboard_shares" force  row level security;
--> statement-breakpoint

-- Staff: owner, admin, member, as a POSITIVE list (never `<> 'couple'`, 0006's tail says why).
-- Same shape as `wedding_vendors` (0006). The couple portal adds a couple clause here, gated on
-- `shared_with_couple`, when it lands.
create policy tenant_isolation on "moodboards"
  for all
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and (
      nullif(current_setting('app.wedding_id', true), '') is null
      or wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    )
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin', 'member')
  )
  with check (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and (
      nullif(current_setting('app.wedding_id', true), '') is null
      or wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    )
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin', 'member')
  );
--> statement-breakpoint

create policy tenant_isolation on "moodboard_shares"
  for all
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and (
      nullif(current_setting('app.wedding_id', true), '') is null
      or wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    )
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin', 'member')
  )
  with check (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and (
      nullif(current_setting('app.wedding_id', true), '') is null
      or wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    )
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin', 'member')
  );
--> statement-breakpoint

-- Link: read-only, the link's own vendor only. Part 0 says why each starts with the role.
create policy link_read on "moodboard_shares"
  for select
  using (
    nullif(current_setting('app.wedding_role', true), '') = 'link'
    and wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    and wedding_vendor_id = nullif(current_setting('app.wedding_vendor_id', true), '')::uuid
  );
--> statement-breakpoint

-- The subquery runs under `moodboard_shares`' own RLS as this same principal, which admits only
-- the link's own share rows -- the explicit vendor clause repeats that as intent.
create policy link_read on "moodboards"
  for select
  using (
    nullif(current_setting('app.wedding_role', true), '') = 'link'
    and wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    and exists (
      select 1 from "moodboard_shares" s
       where s.moodboard_id = moodboards.id
         and s.wedding_vendor_id = nullif(current_setting('app.wedding_vendor_id', true), '')::uuid
    )
  );
--> statement-breakpoint

-- Images only, live only (a pending row has `deleted_at` set), `shared` only, on a board shared
-- with this vendor. The moodboard UI always uploads `shared` (S5), but nothing below the UI holds
-- that -- a hand-built POST can set `internal` -- so the clause is here rather than assumed:
-- a row staff marked internal must not reach a link, whatever screen made it. Found by the
-- tenancy audit, 2026-09-28. A plain file (`kind = 'file'`) is excluded outright.
create policy link_read on "files"
  for select
  using (
    nullif(current_setting('app.wedding_role', true), '') = 'link'
    and wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    and kind = 'image'
    and visibility = 'shared'
    and deleted_at is null
    and exists (
      select 1 from "moodboard_shares" s
       where s.moodboard_id = files.moodboard_id
         and s.wedding_vendor_id = nullif(current_setting('app.wedding_vendor_id', true), '')::uuid
    )
  );
--> statement-breakpoint

-- Explicit, for the reason 0006's grant block gives (a default privilege does nothing when a
-- different role applies a later migration).
grant select, insert, update, delete on "moodboards", "moodboard_shares" to app_user;
--> statement-breakpoint

-- ===========================================================================
-- Part 3. vendor_link_run_sheet(): the whole day, named columns only. Part 0 says why.
-- ===========================================================================
do $$
begin
  if not exists (
    select 1 from pg_roles
     where rolname = current_user and (rolsuper or rolbypassrls)
  ) then
    raise exception
      'Role % cannot bypass RLS, so vendor_link_run_sheet would silently return no rows '
      '(run_sheet_items, wedding_vendors and vendors are FORCE ROW LEVEL SECURITY). Apply '
      'migrations as the table owner with BYPASSRLS -- neondb_owner on Neon, postgres locally. '
      'See packages/db/README.md.', current_user;
  end if;
end
$$;
--> statement-breakpoint

-- Zero rows unless: the principal is a `link`, its wedding vendor is live on that wedding, and
-- that vendor has `full_run_sheet`. Otherwise every row of every live event, in event order then
-- `position` (not `starts_at`: a sheet past midnight sorts wrong by time, events.ts). `vendor_name`
-- is null for a row with no vendor, or one whose vendor was removed from the wedding.
create function public.vendor_link_run_sheet()
returns table (
  id uuid,
  event_id uuid,
  event_label text,
  starts_at text,
  duration_min integer,
  title text,
  place text,
  vendor_name text,
  is_own boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select wv.id, wv.wedding_id
      from public.wedding_vendors wv
     where nullif(current_setting('app.wedding_role', true), '') = 'link'
       and wv.id = nullif(current_setting('app.wedding_vendor_id', true), '')::uuid
       and wv.wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
       and wv.deleted_at is null
       and wv.full_run_sheet
  )
  select r.id,
         e.id,
         e.label,
         to_char(r.starts_at, 'HH24:MI'),
         r.duration_min,
         r.title,
         r.place,
         v.name,
         r.wedding_vendor_id is not distinct from me.id
    from me
    join public.run_sheet_items r on r.wedding_id = me.wedding_id
    -- Every join pinned to the link's wedding, not only the run-sheet row: this runs as the owner,
    -- so no RLS backs a row whose plain FK names another wedding's event or vendor. The repo's
    -- parent reads prevent such a row today; this makes the function not depend on that.
    join public.wedding_events e
      on e.id = r.event_id and e.wedding_id = me.wedding_id and e.deleted_at is null
    left join public.wedding_vendors ov
      on ov.id = r.wedding_vendor_id and ov.wedding_id = me.wedding_id and ov.deleted_at is null
    left join public.vendors v on v.id = ov.vendor_id
   order by e.starts_on, e.starts_at nulls last, e.position, e.id, r.position, r.id
$$;
--> statement-breakpoint

revoke all on function public.vendor_link_run_sheet() from public;
--> statement-breakpoint
grant execute on function public.vendor_link_run_sheet() to app_user;
