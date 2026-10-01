-- Spec 0008: the couple portal. Generated DDL first (drizzle-kit), then by hand: RLS for the new
-- table, the role clause on every policy a couple principal could write through, and the
-- SECURITY DEFINER functions that are the couple's only door onto the planner tables.
--
-- ===========================================================================
-- Part 0. What a `couple` principal can do after this file, and why it is shaped so
-- ===========================================================================
--
-- A couple's GUCs are the planner's (research/07 section 3): `app.org_id` is the studio,
-- `app.wedding_id` their wedding, and only `app.wedding_role = 'couple'` tells them apart. Until
-- now no couple could sign in, so every policy that named no role was harmless. Spec 0008 makes
-- the principal real, and reading the policies with that in mind found that a couple could:
--
--   * UPDATE `organizations` (rename the studio, move `trial_ends_at`), `weddings` (flip their
--     own `couple_modules`, `status`, `notes`), `wedding_domains` and `audit_log`;
--   * INSERT an `invitations` row with role `editor` for their own wedding, accept it with a
--     second address, and read every internal task;
--   * and -- any signed-in user, not only a couple -- INSERT an `org_members` or `wedding_members`
--     row for themselves on any id, because `own_memberships` is `for all` on `user_id` alone.
--
-- None of these is reachable from the app: no Server Function makes those writes for a couple,
-- and nothing issues SQL on a user's behalf. RLS is the backstop for the day that stops being
-- true, so the backstop is closed here, in the same file that makes the principal exist. Found
-- while writing this migration, 2026-09-30.
--
-- The staff list is POSITIVE (`in (...)`, never `<> 'couple'`), so an unset role fails closed and
-- a future role is admitted only by a diff that names it (0006's tail). `editor` is in it on
-- `weddings`, `tasks` and `task_comments` -- a `wedding_members` editor with no `org_members` row
-- is outside staff, trusted with the wedding -- and left out where the table is the studio's
-- (`organizations`) or a grant (`invitations`, `wedding_domains`, `audit_log`, `file_comments`).
--
-- ## The couple reads through functions, not policies
--
-- The couple gets exactly one policy, `couple_read` on `tasks` and `task_comments`, `for select`.
-- Everything else -- the wedding row, run sheet, vendors, budget, moodboards, image comments --
-- is a `couple_*` function returning named columns, the `vendor_link_run_sheet()` shape (0012).
-- RLS grants whole rows, and each of those tables carries a column the couple must not see
-- (`weddings.notes`, `wedding_vendors.notes`, `vendors.email`). With `weddings` now closed to the
-- couple, `notes` is a wall and not a convention: spec 0008 had written it down as the latter,
-- and is amended. Every function checks the wedding's `status` (draft: nothing) and the module
-- switch in `couple_modules` itself.
--
-- ## The couple writes through functions too
--
-- The old `tenant_isolation` on `tasks` let a couple insert, update or delete any shared task.
-- Spec 0008 lets them tick their own and comment. RLS cannot restrict columns, so an UPDATE
-- policy for ticking would also allow renaming; the writes are functions that change exactly the
-- columns they name, on `live` weddings only, and stamp `couple_activity_at` for the planner's
-- unread dot.

CREATE TABLE "file_comments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"wedding_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"author_user_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "couple_activity_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "staff_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "couple_activity_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "staff_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "weddings" ADD COLUMN "couple_modules" text[] DEFAULT array['tasks','moodboards','run_sheet','vendors','budget'] NOT NULL;--> statement-breakpoint
ALTER TABLE "file_comments" ADD CONSTRAINT "file_comments_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_comments" ADD CONSTRAINT "file_comments_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_comments" ADD CONSTRAINT "file_comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "file_comments_org_file_idx" ON "file_comments" USING btree ("org_id","file_id");--> statement-breakpoint
ALTER TABLE "weddings" ADD CONSTRAINT "weddings_couple_modules_check" CHECK (couple_modules <@ array['tasks','moodboards','run_sheet','vendors','budget']::text[]);
--> statement-breakpoint

-- ===========================================================================
-- Part 1. file_comments: RLS, staff only.
-- ===========================================================================
alter table "file_comments" enable row level security;
--> statement-breakpoint
alter table "file_comments" force  row level security;
--> statement-breakpoint

create policy tenant_isolation on "file_comments"
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

grant select, insert, update, delete on "file_comments" to app_user;
--> statement-breakpoint

-- ===========================================================================
-- Part 2. The role clause on every policy that lacked one.
-- ===========================================================================
drop policy tenant_isolation on "organizations";
--> statement-breakpoint
-- Staff of the studio only. An outside `editor` works on one wedding; the studio row (its name,
-- trial and billing columns) is not theirs to write, and nothing they see needs to read it.
create policy tenant_isolation on "organizations"
  for all
  using (
    id = nullif(current_setting('app.org_id', true), '')::uuid
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin', 'member')
  )
  with check (
    id = nullif(current_setting('app.org_id', true), '')::uuid
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin', 'member')
  );
--> statement-breakpoint

drop policy tenant_isolation on "weddings";
--> statement-breakpoint
create policy tenant_isolation on "weddings"
  for all
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and (
      nullif(current_setting('app.wedding_id', true), '') is null
      or id = nullif(current_setting('app.wedding_id', true), '')::uuid
    )
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin', 'member', 'editor')
  )
  with check (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and (
      nullif(current_setting('app.wedding_id', true), '') is null
      or id = nullif(current_setting('app.wedding_id', true), '')::uuid
    )
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin', 'member', 'editor')
  );
--> statement-breakpoint

-- `editor` is left out on purpose: an outside editor inviting people to the wedding is a grant
-- nobody decided on. An assigned `member` is in, pinned to its wedding by the second clause --
-- which also keeps it off staff invites (their `wedding_id` is null).
drop policy tenant_isolation on "invitations";
--> statement-breakpoint
create policy tenant_isolation on "invitations"
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

drop policy tenant_isolation on "wedding_domains";
--> statement-breakpoint
create policy tenant_isolation on "wedding_domains"
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

-- Nothing writes `audit_log` yet. When something does, what a couple may read of it is that
-- writer's decision (spec 0008, Data); until then it is staff's alone.
drop policy tenant_isolation on "audit_log";
--> statement-breakpoint
create policy tenant_isolation on "audit_log"
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

-- Every membership write is a SECURITY DEFINER function already -- `accept_invitation`,
-- `create_studio`, and `remove_wedding_couple` below -- so the user-axis policy only has to READ.
-- `for select` also cannot widen any write it is ORed with (db-migration 4b). Rejected: keeping
-- `for all` and adding a role column check, which leaves "insert yourself into any org" one
-- forgotten clause away.
drop policy own_memberships on "org_members";
--> statement-breakpoint
create policy own_memberships on "org_members"
  for select
  using (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
--> statement-breakpoint
drop policy own_memberships on "wedding_members";
--> statement-breakpoint
create policy own_memberships on "wedding_members"
  for select
  using (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
--> statement-breakpoint

-- ===========================================================================
-- Part 3. The functions. Install guard first, as 0007/0008/0010/0012 do.
-- ===========================================================================
do $$
begin
  if not exists (
    select 1 from pg_roles
     where rolname = current_user and (rolsuper or rolbypassrls)
  ) then
    raise exception
      'Role % cannot bypass RLS, so the couple_* functions would silently return no rows '
      '(every table they read is FORCE ROW LEVEL SECURITY). Apply migrations as the table owner '
      'with BYPASSRLS -- neondb_owner on Neon, postgres locally. See packages/db/README.md.',
      current_user;
  end if;
end
$$;
--> statement-breakpoint

-- The two task triggers from 0001 name `tasks` and `task_comments` unqualified, so they resolve
-- through the CALLER's search_path. Every function below runs with `search_path = ''` (0007's
-- rule), under which the insert trigger fails with `relation "tasks" does not exist` -- measured
-- 2026-10-01 on the first couple comment. Pinning the triggers' own path fixes every definer
-- caller at once, rather than each function widening its path. They stay SECURITY INVOKER.
alter function public.gn_task_comment_inherit() set search_path = public, pg_temp;
--> statement-breakpoint
alter function public.gn_task_visibility_propagate() set search_path = public, pg_temp;
--> statement-breakpoint

-- The caller's couple membership of the wedding its GUCs name, or no row. Every couple_*
-- function starts here, so "is this a couple of this wedding" is written once. It re-reads
-- `wedding_members` rather than trusting `app.wedding_role`: a GUC is data scoping, never a
-- permission (CLAUDE.md invariant 4). Not granted to app_user -- only the functions call it.
create function public.gn_couple_wedding()
returns table (wedding_id uuid, org_id uuid, user_id uuid, status text, couple_modules text[])
language sql
stable
security definer
set search_path = ''
as $$
  select w.id, w.org_id, wm.user_id, w.status, w.couple_modules
    from public.weddings w
    join public.wedding_members wm on wm.wedding_id = w.id
    -- A deleted studio closes its couples' portals too.
    join public.organizations o on o.id = w.org_id and o.deleted_at is null
   where nullif(current_setting('app.wedding_role', true), '') = 'couple'
     and w.id = nullif(current_setting('app.wedding_id', true), '')::uuid
     and w.org_id = nullif(current_setting('app.org_id', true), '')::uuid
     and wm.user_id = nullif(current_setting('app.user_id', true), '')::uuid
     and wm.role = 'couple'
     and w.deleted_at is null
$$;
--> statement-breakpoint
revoke all on function public.gn_couple_wedding() from public;
--> statement-breakpoint

-- True when the caller is a couple of a readable (live or archived) wedding with `p_module` on.
-- Granted to app_user because `couple_read` below calls it from a policy, which runs as the
-- caller. It answers only about the caller's own wedding, so exposing it gives nothing away.
create function public.gn_couple_module_open(p_module text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.gn_couple_wedding() c
     where c.status in ('live', 'archived') and p_module = any (c.couple_modules)
  )
$$;
--> statement-breakpoint
revoke all on function public.gn_couple_module_open(text) from public;
--> statement-breakpoint
grant execute on function public.gn_couple_module_open(text) to app_user;
--> statement-breakpoint

-- Staff keep `for all` with the staff list. The couple gets a second, read-only policy that
-- starts with `= 'couple'`, so inside a staff transaction it contributes nothing (4b's guard).
drop policy tenant_isolation on "tasks";
--> statement-breakpoint
create policy tenant_isolation on "tasks"
  for all
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and (
      nullif(current_setting('app.wedding_id', true), '') is null
      or wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    )
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin', 'member', 'editor')
  )
  with check (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and (
      nullif(current_setting('app.wedding_id', true), '') is null
      or wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    )
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin', 'member', 'editor')
  );
--> statement-breakpoint
create policy couple_read on "tasks"
  for select
  using (
    nullif(current_setting('app.wedding_role', true), '') = 'couple'
    and org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    and visibility = 'shared'
    and public.gn_couple_module_open('tasks')
  );
--> statement-breakpoint

drop policy tenant_isolation on "task_comments";
--> statement-breakpoint
create policy tenant_isolation on "task_comments"
  for all
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and (
      nullif(current_setting('app.wedding_id', true), '') is null
      or wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    )
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin', 'member', 'editor')
  )
  with check (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and (
      nullif(current_setting('app.wedding_id', true), '') is null
      or wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    )
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin', 'member', 'editor')
  );
--> statement-breakpoint
create policy couple_read on "task_comments"
  for select
  using (
    nullif(current_setting('app.wedding_role', true), '') = 'couple'
    and org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    and visibility = 'shared'
    and public.gn_couple_module_open('tasks')
  );
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------

-- The caller's couple weddings, by `app.user_id` alone (`withUser`): how a couple principal
-- learns its `orgId`, which it cannot read from `weddings` -- the gap `principalForWedding`'s
-- comment used to leave to "P7" (repos/memberships.ts, before this migration). Rejected: `org_id` on `wedding_members`, a copy to keep in step.
create function public.my_couple_weddings()
returns table (
  wedding_id uuid,
  org_id uuid,
  couple_display_name text,
  wedding_date date,
  status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select w.id, w.org_id, w.couple_display_name, w.wedding_date, w.status
    from public.wedding_members wm
    join public.weddings w on w.id = wm.wedding_id and w.deleted_at is null
    join public.organizations o on o.id = w.org_id and o.deleted_at is null
   where wm.user_id = nullif(current_setting('app.user_id', true), '')::uuid
     and wm.role = 'couple'
   order by w.wedding_date nulls last, w.id
$$;
--> statement-breakpoint

-- The portal's header and home: named columns, never `notes`. Returned for a draft wedding too,
-- so the portal can say it is not open yet. The contact is the staff member assigned to the
-- wedding (an `editor` row held by an org member), earliest first, else the org's owner.
create function public.couple_home()
returns table (
  wedding_id uuid,
  couple_display_name text,
  wedding_date date,
  venue text,
  status text,
  locale_default text,
  timezone text,
  couple_modules text[],
  studio_name text,
  contact_name text,
  contact_email text,
  couple_user_ids uuid[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select w.id, w.couple_display_name, w.wedding_date, w.venue, w.status, w.locale_default,
         w.timezone, w.couple_modules, o.name, ct.name, ct.email,
         -- Both partners, so "Voor jullie" can include a task assigned to either by name:
         -- `own_memberships` shows a user only their own row.
         array(
           select wm.user_id from public.wedding_members wm
            where wm.wedding_id = w.id and wm.role = 'couple'
            order by wm.created_at, wm.user_id
         )
    from public.gn_couple_wedding() c
    join public.weddings w on w.id = c.wedding_id
    join public.organizations o on o.id = w.org_id
    left join lateral (
      select x.name, x.email
        from (
          select u.name, u.email, 0 as rank, wm.created_at
            from public.wedding_members wm
            join public.org_members om on om.user_id = wm.user_id and om.org_id = w.org_id
            join public.users u on u.id = wm.user_id
           where wm.wedding_id = w.id and wm.role = 'editor'
          union all
          select u.name, u.email, 1, om.created_at
            from public.org_members om
            join public.users u on u.id = om.user_id
           where om.org_id = w.org_id and om.role = 'owner'
        ) x
       order by x.rank, x.created_at
       limit 1
    ) ct on true
$$;
--> statement-breakpoint

-- The whole day, every row. Same columns and order as `vendor_link_run_sheet()` minus `is_own`,
-- plus the event date. Every join pinned to the wedding: this runs as the owner.
create function public.couple_run_sheet()
returns table (
  id uuid,
  event_id uuid,
  event_label text,
  event_starts_on date,
  starts_at text,
  duration_min integer,
  title text,
  place text,
  vendor_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, e.id, e.label, e.starts_on, to_char(r.starts_at, 'HH24:MI'), r.duration_min,
         r.title, r.place, v.name
    from public.gn_couple_wedding() c
    join public.run_sheet_items r on r.wedding_id = c.wedding_id
    join public.wedding_events e
      on e.id = r.event_id and e.wedding_id = c.wedding_id and e.deleted_at is null
    left join public.wedding_vendors ov
      on ov.id = r.wedding_vendor_id and ov.wedding_id = c.wedding_id and ov.deleted_at is null
    left join public.vendors v on v.id = ov.vendor_id and v.org_id = c.org_id
   where c.status in ('live', 'archived') and 'run_sheet' = any (c.couple_modules)
   order by e.starts_on, e.starts_at nulls last, e.position, e.id, r.position, r.id
$$;
--> statement-breakpoint

-- Booked vendors, name and category. No contact details, no notes: the planner stays the
-- couple's single point of contact (spec 0008).
create function public.couple_vendors()
returns table (id uuid, name text, category text)
language sql
stable
security definer
set search_path = ''
as $$
  select wv.id, v.name, v.category
    from public.gn_couple_wedding() c
    join public.wedding_vendors wv
      on wv.wedding_id = c.wedding_id and wv.deleted_at is null and wv.status = 'booked'
    join public.vendors v on v.id = wv.vendor_id and v.org_id = c.org_id
   where c.status in ('live', 'archived') and 'vendors' = any (c.couple_modules)
   order by v.category, v.name, wv.id
$$;
--> statement-breakpoint

create function public.couple_budget_lines()
returns table (
  id uuid,
  category text,
  label text,
  estimate_cents integer,
  actual_cents integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.category, l.label, l.estimate_cents, l.actual_cents
    from public.gn_couple_wedding() c
    join public.budget_lines l on l.wedding_id = c.wedding_id and l.deleted_at is null
   where c.status in ('live', 'archived') and 'budget' = any (c.couple_modules)
   order by l.category, l.label, l.id
$$;
--> statement-breakpoint

create function public.couple_payments()
returns table (
  id uuid,
  budget_line_id uuid,
  label text,
  due_on date,
  amount_cents integer,
  paid_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, l.id, l.label, p.due_on, p.amount_cents, p.paid_at
    from public.gn_couple_wedding() c
    join public.payments p on p.wedding_id = c.wedding_id
    join public.budget_lines l
      on l.id = p.budget_line_id and l.wedding_id = c.wedding_id and l.deleted_at is null
   where c.status in ('live', 'archived') and 'budget' = any (c.couple_modules)
   order by p.due_on, l.label, p.id
$$;
--> statement-breakpoint

-- Boards shared with the couple, with a count of their live shared images.
create function public.couple_moodboards()
returns table (id uuid, name text, is_default boolean, image_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.name, m.is_default,
         (select count(*)::integer
            from public.files f
           where f.moodboard_id = m.id and f.wedding_id = c.wedding_id and f.kind = 'image'
             and f.visibility = 'shared' and f.deleted_at is null)
    from public.gn_couple_wedding() c
    join public.moodboards m on m.wedding_id = c.wedding_id and m.shared_with_couple
   where c.status in ('live', 'archived') and 'moodboards' = any (c.couple_modules)
   order by m.position, m.id
$$;
--> statement-breakpoint

-- One live, shared image the couple may see, or no row: on a board shared with them, in their
-- readable wedding, moodboards on. The single definition every image function below uses.
create function public.gn_couple_image(p_file_id uuid)
returns table (file_id uuid, org_id uuid, wedding_id uuid, moodboard_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, f.org_id, f.wedding_id, f.moodboard_id
    from public.gn_couple_wedding() c
    join public.files f on f.id = p_file_id and f.wedding_id = c.wedding_id
    join public.moodboards m
      on m.id = f.moodboard_id and m.wedding_id = c.wedding_id and m.shared_with_couple
   where c.status in ('live', 'archived') and 'moodboards' = any (c.couple_modules)
     and f.kind = 'image' and f.visibility = 'shared' and f.deleted_at is null
$$;
--> statement-breakpoint
revoke all on function public.gn_couple_image(uuid) from public;
--> statement-breakpoint

-- `storage_key` is returned so the server can presign a GET (and `assertKeyInScope` it); it is
-- never sent to the browser. `by_couple` drives the "Toegevoegd door" line.
create function public.couple_board_images(p_moodboard_id uuid)
returns table (
  id uuid,
  name text,
  storage_key text,
  mime text,
  uploader_name text,
  by_couple boolean,
  is_own boolean,
  created_at timestamptz,
  comment_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  -- A partner's own name, else their address: an account made through an invitation has no
  -- name until someone asks for one, and "Toegevoegd door" with nothing after it says nothing.
  -- Staff get their name or null (the app shows the studio), never their address.
  select f.id, f.name, f.storage_key, f.mime,
         case when cp.user_id is not null then coalesce(nullif(u.name, ''), u.email)
              else nullif(u.name, '') end,
         cp.user_id is not null,
         f.uploaded_by is not distinct from c.user_id,
         f.created_at,
         (select count(*)::integer from public.file_comments fc
           where fc.file_id = f.id and fc.deleted_at is null)
    from public.gn_couple_wedding() c
    join public.moodboards m
      on m.id = p_moodboard_id and m.wedding_id = c.wedding_id and m.shared_with_couple
    join public.files f
      on f.moodboard_id = m.id and f.wedding_id = c.wedding_id and f.kind = 'image'
     and f.visibility = 'shared' and f.deleted_at is null
    left join public.users u on u.id = f.uploaded_by
    left join public.wedding_members cp
      on cp.wedding_id = c.wedding_id and cp.user_id = f.uploaded_by and cp.role = 'couple'
   where c.status in ('live', 'archived') and 'moodboards' = any (c.couple_modules)
   order by f.created_at, f.id
$$;
--> statement-breakpoint

create function public.couple_file_comments(p_file_id uuid)
returns table (
  id uuid,
  author_name text,
  by_couple boolean,
  is_own boolean,
  body text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  -- Names as in couple_board_images: a partner's address when they have no name, staff never.
  select fc.id,
         case when cp.user_id is not null then coalesce(nullif(u.name, ''), u.email)
              else nullif(u.name, '') end,
         cp.user_id is not null,
         fc.author_user_id is not distinct from nullif(current_setting('app.user_id', true), '')::uuid,
         fc.body, fc.created_at
    from public.gn_couple_image(p_file_id) i
    join public.file_comments fc
      on fc.file_id = i.file_id and fc.wedding_id = i.wedding_id and fc.deleted_at is null
    left join public.users u on u.id = fc.author_user_id
    left join public.wedding_members cp
      on cp.wedding_id = i.wedding_id and cp.user_id = fc.author_user_id and cp.role = 'couple'
   order by fc.created_at, fc.id
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Writes. Each returns true when it changed exactly what it names, false otherwise -- the
-- caller maps false to `notFound`, since a couple cannot tell "not yours" from "not there" and
-- should not be able to. All refuse unless the wedding is `live` and the module is on.
-- Ids come from the application (`newId()`, invariant 9).
-- ---------------------------------------------------------------------------

-- A couple ticks only its own tasks: `assignee_role = 'couple'`, or assigned to either partner.
create function public.couple_set_task_done(p_task_id uuid, p_done boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c record;
  n integer;
begin
  select * into c from public.gn_couple_wedding();
  if not found or c.status <> 'live' or not ('tasks' = any (c.couple_modules)) then
    return false;
  end if;
  update public.tasks t
     set status = case when p_done then 'done' else 'open' end,
         completed_at = case when p_done then now() else null end,
         couple_activity_at = now(),
         updated_at = now()
   where t.id = p_task_id
     and t.wedding_id = c.wedding_id
     and t.deleted_at is null
     and t.visibility = 'shared'
     and (
       t.assignee_role = 'couple'
       or t.assignee_user_id in (
         select wm.user_id from public.wedding_members wm
          where wm.wedding_id = c.wedding_id and wm.role = 'couple'
       )
     );
  get diagnostics n = row_count;
  return n = 1;
end
$$;
--> statement-breakpoint

-- Any shared task. 4000 is `COMMENT_MAX` in apps/web/src/lib/task-form.ts; the app checks it
-- first with a message, this is the backstop. `gn_task_comment_inherit` copies visibility.
create function public.couple_add_task_comment(p_id uuid, p_task_id uuid, p_body text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c record;
  n integer;
begin
  select * into c from public.gn_couple_wedding();
  if not found or c.status <> 'live' or not ('tasks' = any (c.couple_modules)) then
    return false;
  end if;
  if p_body is null or length(btrim(p_body)) = 0 or length(p_body) > 4000 then
    return false;
  end if;
  insert into public.task_comments (id, org_id, wedding_id, task_id, author_user_id, body)
  select p_id, t.org_id, t.wedding_id, t.id, c.user_id, btrim(p_body)
    from public.tasks t
   where t.id = p_task_id and t.wedding_id = c.wedding_id and t.deleted_at is null
     and t.visibility = 'shared';
  get diagnostics n = row_count;
  if n = 1 then
    update public.tasks set couple_activity_at = now() where id = p_task_id;
  end if;
  return n = 1;
end
$$;
--> statement-breakpoint

create function public.couple_delete_task_comment(p_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c record;
  n integer;
begin
  select * into c from public.gn_couple_wedding();
  if not found or c.status <> 'live' or not ('tasks' = any (c.couple_modules)) then
    return false;
  end if;
  update public.task_comments
     set deleted_at = now(), updated_at = now()
   where id = p_id and wedding_id = c.wedding_id and author_user_id = c.user_id
     and deleted_at is null;
  get diagnostics n = row_count;
  return n = 1;
end
$$;
--> statement-breakpoint

-- Step one of a couple upload, the pending row of repos/files.ts (`deleted_at = created_at`).
-- The key must be exactly `<org>/<wedding>/<file>` for this file: the server built it
-- (`buildObjectKey`), and this refuses one aimed anywhere else.
create function public.couple_start_image(
  p_id uuid,
  p_moodboard_id uuid,
  p_name text,
  p_storage_key text,
  p_size_bytes bigint,
  p_mime text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c record;
  v_at timestamptz := now();
  n integer;
begin
  select * into c from public.gn_couple_wedding();
  if not found or c.status <> 'live' or not ('moodboards' = any (c.couple_modules)) then
    return false;
  end if;
  if p_storage_key <> c.org_id::text || '/' || c.wedding_id::text || '/' || p_id::text then
    return false;
  end if;
  insert into public.files (id, org_id, wedding_id, kind, name, storage_key, size_bytes, mime,
                            visibility, uploaded_by, moodboard_id, created_at, updated_at,
                            deleted_at)
  select p_id, c.org_id, c.wedding_id, 'image', p_name, p_storage_key, p_size_bytes, p_mime,
         'shared', c.user_id, m.id, v_at, v_at, v_at
    from public.moodboards m
   where m.id = p_moodboard_id and m.wedding_id = c.wedding_id and m.shared_with_couple;
  get diagnostics n = row_count;
  return n = 1;
end
$$;
--> statement-breakpoint

create function public.couple_confirm_image(p_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c record;
  n integer;
begin
  select * into c from public.gn_couple_wedding();
  if not found or c.status <> 'live' or not ('moodboards' = any (c.couple_modules)) then
    return false;
  end if;
  update public.files f
     set deleted_at = null, updated_at = now(), couple_activity_at = now()
   where f.id = p_id and f.wedding_id = c.wedding_id and f.uploaded_by = c.user_id
     and f.deleted_at = f.created_at
     and exists (
       select 1 from public.moodboards m
        where m.id = f.moodboard_id and m.wedding_id = c.wedding_id and m.shared_with_couple
     );
  get diagnostics n = row_count;
  return n = 1;
end
$$;
--> statement-breakpoint

-- Own uploads only; the planner's images are the planner's.
create function public.couple_delete_image(p_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c record;
  n integer;
begin
  select * into c from public.gn_couple_wedding();
  if not found or c.status <> 'live' then
    return false;
  end if;
  update public.files f
     set deleted_at = now(), updated_at = now()
   where f.id = p_id and f.uploaded_by = c.user_id
     and exists (select 1 from public.gn_couple_image(p_id));
  get diagnostics n = row_count;
  return n = 1;
end
$$;
--> statement-breakpoint

create function public.couple_add_file_comment(p_id uuid, p_file_id uuid, p_body text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c record;
  n integer;
begin
  select * into c from public.gn_couple_wedding();
  if not found or c.status <> 'live' then
    return false;
  end if;
  if p_body is null or length(btrim(p_body)) = 0 or length(p_body) > 4000 then
    return false;
  end if;
  insert into public.file_comments (id, org_id, wedding_id, file_id, author_user_id, body)
  select p_id, i.org_id, i.wedding_id, i.file_id, c.user_id, btrim(p_body)
    from public.gn_couple_image(p_file_id) i;
  get diagnostics n = row_count;
  if n = 1 then
    update public.files set couple_activity_at = now() where id = p_file_id;
  end if;
  return n = 1;
end
$$;
--> statement-breakpoint

create function public.couple_delete_file_comment(p_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c record;
  n integer;
begin
  select * into c from public.gn_couple_wedding();
  if not found or c.status <> 'live' or not ('moodboards' = any (c.couple_modules)) then
    return false;
  end if;
  update public.file_comments
     set deleted_at = now(), updated_at = now()
   where id = p_id and wedding_id = c.wedding_id and author_user_id = c.user_id
     and deleted_at is null;
  get diagnostics n = row_count;
  return n = 1;
end
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Staff: the couple section of a wedding. Owner and admin could read `wedding_members` through
-- `org_staff_read` (0007), but the assigned member -- whom spec 0008 lets invite and remove --
-- reads only their own row there, and `own_memberships` lets nobody touch anyone else's. So the
-- three things the section needs are functions sharing one check.
-- ---------------------------------------------------------------------------

-- Owner or admin of the wedding's org, or the member assigned to that wedding, read from the
-- membership rows themselves and not from `app.wedding_role`. Internal.
create function public.gn_can_manage_couple(p_wedding_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.weddings w
      join public.org_members om on om.org_id = w.org_id
     where w.id = p_wedding_id
       and w.deleted_at is null
       and w.org_id = nullif(current_setting('app.org_id', true), '')::uuid
       and om.user_id = nullif(current_setting('app.user_id', true), '')::uuid
       and (
         om.role in ('owner', 'admin')
         or (
           om.role = 'member'
           and exists (
             select 1 from public.wedding_members wm
              where wm.wedding_id = w.id and wm.user_id = om.user_id and wm.role = 'editor'
           )
         )
       )
  )
$$;
--> statement-breakpoint
revoke all on function public.gn_can_manage_couple(uuid) from public;
--> statement-breakpoint

-- The partners who accepted, for the settings list. Nothing for a caller who may not manage.
create function public.wedding_couple_members(p_wedding_id uuid)
returns table (user_id uuid, name text, email text, joined_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.name, u.email, wm.created_at
    from public.wedding_members wm
    join public.users u on u.id = wm.user_id
   where public.gn_can_manage_couple(p_wedding_id)
     and wm.wedding_id = p_wedding_id and wm.role = 'couple'
   order by wm.created_at, u.id
$$;
--> statement-breakpoint

-- Why an address cannot be invited as a partner, or null when it can: `forbidden` (the caller
-- may not manage this wedding), `alreadyStaff` (a staff member of the org already sees what
-- they are allowed to, and a `couple` row beside their staff role would only confuse it),
-- `alreadyPartner`. The reverse order -- a partner later invited as staff -- is safe because
-- `principalForWedding` takes only an `editor` row as an assignment. `p_email` is compared lower-cased on both sides.
create function public.couple_invite_blocker(p_wedding_id uuid, p_email text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not public.gn_can_manage_couple(p_wedding_id) then 'forbidden'
    when exists (
      select 1 from public.org_members om
        join public.users u on u.id = om.user_id
       where om.org_id = nullif(current_setting('app.org_id', true), '')::uuid
         and lower(u.email) = lower(p_email)
    ) then 'alreadyStaff'
    when exists (
      select 1 from public.wedding_members wm
        join public.users u on u.id = wm.user_id
       where wm.wedding_id = p_wedding_id and wm.role = 'couple' and lower(u.email) = lower(p_email)
    ) then 'alreadyPartner'
    else null
  end
$$;
--> statement-breakpoint

-- Removes a partner who already accepted. Deletes `couple` rows only: it cannot unassign staff.
create function public.remove_wedding_couple(p_wedding_id uuid, p_user_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if not public.gn_can_manage_couple(p_wedding_id) then
    return false;
  end if;
  delete from public.wedding_members wm
   where wm.wedding_id = p_wedding_id and wm.user_id = p_user_id and wm.role = 'couple';
  get diagnostics n = row_count;
  return n = 1;
end
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- resolve_invitation gains `wedding_name`: the couple's landing screen says whose wedding they
-- are invited to (spec 0008). A column added to a `returns table` is a new signature, so it is
-- dropped and recreated rather than replaced; same body as 0007 plus one left join. The name is
-- shown to whoever holds the token, who is the invitee -- the same reach as `org_name` already.
-- ---------------------------------------------------------------------------
drop function public.resolve_invitation(text);
--> statement-breakpoint
create function public.resolve_invitation(p_token_hash text)
returns table (
  invitation_id uuid,
  org_id uuid,
  org_name text,
  wedding_id uuid,
  email text,
  role text,
  inviter_name text,
  status text,
  wedding_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id,
         i.org_id,
         o.name,
         i.wedding_id,
         i.email,
         i.role,
         u.name,
         case
           when i.accepted_at is not null then 'accepted'
           when i.expires_at <= now() then 'expired'
           else 'pending'
         end,
         w.couple_display_name
    from public.invitations i
    join public.organizations o on o.id = i.org_id and o.deleted_at is null
    left join public.users u on u.id = i.invited_by
    -- Pinned to the invitation's org: `invitations.wedding_id` has no FK (0007), so without it a
    -- hand-made row naming another org's wedding would return that couple's name.
    left join public.weddings w
      on w.id = i.wedding_id and w.org_id = i.org_id and w.deleted_at is null
   where i.token_hash = p_token_hash
$$;
--> statement-breakpoint

-- Execute for app_user only, never PUBLIC (0007's rule for every definer here).
do $$
declare
  f text;
begin
  foreach f in array array[
    'resolve_invitation(text)',
    'my_couple_weddings()',
    'couple_home()',
    'couple_run_sheet()',
    'couple_vendors()',
    'couple_budget_lines()',
    'couple_payments()',
    'couple_moodboards()',
    'couple_board_images(uuid)',
    'couple_file_comments(uuid)',
    'couple_set_task_done(uuid, boolean)',
    'couple_add_task_comment(uuid, uuid, text)',
    'couple_delete_task_comment(uuid)',
    'couple_start_image(uuid, uuid, text, text, bigint, text)',
    'couple_confirm_image(uuid)',
    'couple_delete_image(uuid)',
    'couple_add_file_comment(uuid, uuid, text)',
    'couple_delete_file_comment(uuid)',
    'remove_wedding_couple(uuid, uuid)',
    'wedding_couple_members(uuid)',
    'couple_invite_blocker(uuid, text)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to app_user', f);
  end loop;
end
$$;
