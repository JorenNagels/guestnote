-- Row Level Security and grants for the ten tables 0006_planner_tables.sql created
-- (spec 0003, slice F1).
--
-- Hand-written, for the reason 0001_rls.sql gives: `CREATE POLICY` is the SQL you most want
-- to be able to read six months from now, and keeping drizzle-kit out of the policy business
-- means it can never produce a diff that quietly drops one. Numbered 0007 and not 0006
-- because the journal takes one entry per file; the pair is one change and is applied
-- together, in order, in one `psql --single-transaction` each (docs: /db-migration skill).
--
-- ## The rule every policy here carries: a `couple` reads none of it
--
-- spec 0003: "Until then no new table is readable by a `couple` principal. Every new policy
-- excludes `app.wedding_role = 'couple'`." A couple has no org, so they need a read path and
-- invite sending that do not exist yet, and until they do nothing here has a reason to admit
-- them. The tenant keys alone cannot do this: research/07-auth-and-tenancy.md section 3
-- makes a couple's GUCs and a planner's GUCs IDENTICAL, so `app.org_id` and `app.wedding_id`
-- match for a couple on their own wedding and the row would be returned. The role clause is
-- the only thing that tells them apart -- the same argument as `tasks.visibility`.
--
-- It is written as a POSITIVE list, not `<> 'couple'`:
--
--     nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin', 'member')
--
--   * An unset role is NULL, so the row is filtered. Fails closed, like everything else here.
--   * `editor` is out too. spec 0003's permissions table gives `editor` none of these
--     screens "in this build", and a negative test would have admitted them by omission.
--     Cost: admitting `editor` later is a new migration, not a one-line app change. That is
--     the price of the list being the whole truth.
--
-- The narrower "who may WRITE" question (member reads vendors and templates, owner and admin
-- write them) is NOT in these policies. It is the Server Function's job, per spec 0003
-- ("Each action checks membership itself"), and duplicating it in SQL would make two places
-- that must agree. The one exception is `vendor_links`, below, because it mints access.
--
-- ## Wedding-scoped: seven tables
--
-- Both keys, exactly the shape 0001 gives `invitations`: `org_id` always, `wedding_id` only
-- where the principal is pinned to one (`assignedStaff`, `weddingMember`). An org-wide
-- `orgStaff` leaves `app.wedding_id` unset and reads the whole org.
--
-- ## Org-scoped: three tables
--
-- `vendors`, `task_templates`, `template_items` carry `org_id` and no `wedding_id`. Their
-- policy is `org_id` plus the role clause -- and note it does NOT narrow a pinned `member`
-- to one wedding, because there is no wedding on the row to narrow by. A member reads the
-- org's whole directory, which is what spec 0003 says.
--
-- ## Visibility, on `files` and `template_items`
--
-- Both carry `visibility` (`shared|internal`), so `schema-coverage.test.ts` requires their
-- policy to test `app.wedding_role`, and the role clause above already does. The second,
-- `visibility = 'shared' or role in (... 'editor')`, clause is REDUNDANT today: every role
-- the first clause admits is also one that sees internal rows. It is there so that the day
-- the couple spec adds `couple` to the first list, an internal file does not become
-- readable as a side effect. Two independent clauses, either of which alone keeps a couple
-- out of an internal row -- the same property `tasks` has, and the reason to pay for a
-- clause that decides nothing yet.
--
-- ## `vendor_links`: owner and admin only, reads included
--
-- It holds the hash of a bearer token and its expiry. A `member` has no reason to read
-- either, and "written by owner or admin only" (spec 0003) is enforced here rather than
-- left to the action, because a wrongly-permitted write is a minted credential. The `link`
-- principal and the SECURITY DEFINER lookup that reads a token are S10's, with their own
-- policy set and their own tenancy audit; this migration adds none of it.
--
-- ## Known, and deliberately not fixed here
--
-- `weddings` gained `notes`, `venue`, `headcount`, `color` in 0006. Its policy is 0001's and
-- is unchanged: it admits a `couple` to their own wedding row, whole. So `weddings.notes`,
-- which is the planner's own, becomes couple-readable the day a couple reaches that table.
-- Nothing can today. The couple-portal spec has to answer it (column-level grants, or a
-- separate table) before it ships; changing who reads `weddings` is not F1's decision.

-- ---------------------------------------------------------------------------
-- Enable AND force. ENABLE alone exempts the table owner; see 0001.
-- ---------------------------------------------------------------------------
alter table "wedding_events"   enable row level security;
alter table "wedding_events"   force  row level security;
alter table "budget_lines"     enable row level security;
alter table "budget_lines"     force  row level security;
alter table "payments"         enable row level security;
alter table "payments"         force  row level security;
alter table "wedding_vendors"  enable row level security;
alter table "wedding_vendors"  force  row level security;
alter table "run_sheet_items"  enable row level security;
alter table "run_sheet_items"  force  row level security;
alter table "files"            enable row level security;
alter table "files"            force  row level security;
alter table "vendor_links"     enable row level security;
alter table "vendor_links"     force  row level security;
alter table "vendors"          enable row level security;
alter table "vendors"          force  row level security;
alter table "task_templates"   enable row level security;
alter table "task_templates"   force  row level security;
alter table "template_items"   enable row level security;
alter table "template_items"   force  row level security;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Wedding-scoped, no visibility column.
-- ---------------------------------------------------------------------------
create policy tenant_isolation on "wedding_events"
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

create policy tenant_isolation on "budget_lines"
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

create policy tenant_isolation on "payments"
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

create policy tenant_isolation on "wedding_vendors"
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

create policy tenant_isolation on "run_sheet_items"
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

-- ---------------------------------------------------------------------------
-- Wedding-scoped, with a visibility column. See the header: the second clause decides
-- nothing today and is the one that keeps `internal` rows internal when `couple` is added.
-- ---------------------------------------------------------------------------
create policy tenant_isolation on "files"
  for all
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and (
      nullif(current_setting('app.wedding_id', true), '') is null
      or wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    )
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin', 'member')
    and (
      visibility = 'shared'
      or nullif(current_setting('app.wedding_role', true), '')
           in ('owner', 'admin', 'member', 'editor')
    )
  )
  with check (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and (
      nullif(current_setting('app.wedding_id', true), '') is null
      or wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    )
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin', 'member')
    and (
      visibility = 'shared'
      or nullif(current_setting('app.wedding_role', true), '')
           in ('owner', 'admin', 'member', 'editor')
    )
  );
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- vendor_links: owner and admin, reads and writes.
-- ---------------------------------------------------------------------------
create policy tenant_isolation on "vendor_links"
  for all
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and (
      nullif(current_setting('app.wedding_id', true), '') is null
      or wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    )
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin')
  )
  with check (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and (
      nullif(current_setting('app.wedding_id', true), '') is null
      or wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    )
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin')
  );
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Org-scoped: `org_id` and the role clause, no wedding key.
-- ---------------------------------------------------------------------------
create policy tenant_isolation on "vendors"
  for all
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin', 'member')
  )
  with check (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin', 'member')
  );
--> statement-breakpoint

create policy tenant_isolation on "task_templates"
  for all
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin', 'member')
  )
  with check (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin', 'member')
  );
--> statement-breakpoint

create policy tenant_isolation on "template_items"
  for all
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin', 'member')
    and (
      visibility = 'shared'
      or nullif(current_setting('app.wedding_role', true), '')
           in ('owner', 'admin', 'member', 'editor')
    )
  )
  with check (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin', 'member')
    and (
      visibility = 'shared'
      or nullif(current_setting('app.wedding_role', true), '')
           in ('owner', 'admin', 'member', 'editor')
    )
  );
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Grants. 0002's `alter default privileges` already covers a table created by the role
-- that ran it, which is how 0004's mail tables were reached with no grant work. Stated
-- again here, explicitly, because a default privilege silently does nothing when a later
-- migration is applied by a DIFFERENT role than 0002 was -- and the symptom is `permission
-- denied` at runtime, in staging, on the first request. Idempotent; grants to `app_user`
-- and nothing else, and no DDL rights, exactly as 0002.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on
  "wedding_events", "budget_lines", "payments", "wedding_vendors", "run_sheet_items",
  "files", "vendor_links", "vendors", "task_templates", "template_items"
  to app_user;
