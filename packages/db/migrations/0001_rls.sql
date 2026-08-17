-- Row Level Security: the backstop for the bug nobody foresaw.
--
-- Layer 1 is the repository layer -- packages/db exports no unscoped handle, only
-- withTenant()/withUser(). This is layer 2, and it exists on the assumption that
-- layer 1 will eventually have a hole in it. research/05-architecture.md section 4.
--
-- Hand-written rather than generated. `CREATE POLICY` is the SQL you most want to be
-- able to read six months from now, and keeping drizzle-kit out of the policy
-- business means it can never produce a diff that quietly drops one.
--
-- FOUR GUCs, all set transaction-locally by withTenant():
--
--   app.user_id       the authenticated user. Resolves memberships.
--   app.org_id        the tenant. A DATA-SCOPING MECHANISM, NEVER A PERMISSION.
--   app.wedding_id    set for any principal without an org_members row. Mandatory
--                     for those, or the org-wide branch below lets a couple read
--                     every wedding in the planner's book of business.
--   app.wedding_role  owner|admin|member|editor|couple. Decides `internal` rows.
--
-- Every predicate reads them through `nullif(current_setting(name, true), '')`:
--
--   * `true` is missing_ok -- an unset GUC yields NULL rather than erroring.
--   * `nullif(..., '')` makes the empty string mean "unset", because withTenant sets
--     every GUC explicitly, using '' for absent, so a transaction can never inherit
--     a value it did not ask for. '' would fail a ::uuid cast.
--   * A NULL tenant then makes `org_id = NULL` evaluate to NULL, so the row is
--     filtered. **The schema fails closed: no GUCs means no rows.**
--
-- Policies are FOR ALL with an identical WITH CHECK, so a tenant cannot write a row
-- into another tenant either. Two consequences worth knowing rather than
-- discovering:
--
--   * Creating an organisation cannot be done under a tenant context, because there
--     is no org_id yet. Signup is genuinely a create-tenant operation and runs
--     through @guestnote/db/unsafe.
--   * Accepting an invitation writes the invitee's OWN membership row, which is
--     exactly what the own_memberships WITH CHECK permits. That matches the flow in
--     research/07-auth-and-tenancy.md section 4b: the user signs in via magic link
--     first, so their user_id exists and is the one acting.
--
-- No policy names a role (no `TO app_user`), so every policy applies to everyone,
-- including the table owner -- see FORCE below. Grants live in the next migration so
-- that this one has no dependency on a role existing.

-- ---------------------------------------------------------------------------
-- Enable. ENABLE alone is not enough: a table's OWNER bypasses its own policies,
-- and on a managed Postgres the application frequently connects as the owner.
-- FORCE removes that exemption. It does NOT save you from a role with BYPASSRLS or
-- superuser, which is why test/pooling.test.ts asserts the connected role has
-- neither.
-- ---------------------------------------------------------------------------
alter table "organizations"    enable row level security;
alter table "organizations"    force  row level security;
alter table "org_members"      enable row level security;
alter table "org_members"      force  row level security;
alter table "invitations"      enable row level security;
alter table "invitations"      force  row level security;
alter table "weddings"         enable row level security;
alter table "weddings"         force  row level security;
alter table "wedding_members"  enable row level security;
alter table "wedding_members"  force  row level security;
alter table "wedding_domains"  enable row level security;
alter table "wedding_domains"  force  row level security;
alter table "tasks"            enable row level security;
alter table "tasks"            force  row level security;
alter table "task_comments"    enable row level security;
alter table "task_comments"    force  row level security;
alter table "audit_log"        enable row level security;
alter table "audit_log"        force  row level security;

-- `users` deliberately has NO row level security, and this is a decision rather than
-- an omission. Better Auth must look a user up BY EMAIL before any session exists,
-- so there is no app.user_id to scope by at the moment of sign-in; a policy here
-- would break authentication outright. A user is also not owned by an organisation
-- -- one person can be a couple on one wedding and staff at a planner.
--
-- The mitigation is structural, not a policy: the repository layer exposes no user
-- listing or search, so there is no code path that enumerates users. If that ever
-- changes, revisit this.
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- organizations: the row's own id IS the tenant.
-- ---------------------------------------------------------------------------
create policy tenant_isolation on "organizations"
  for all
  using       (id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check  (id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- weddings: org-scoped, and its own id is the wedding scope -- so the second clause
-- compares `id`, not `wedding_id`.
-- ---------------------------------------------------------------------------
create policy tenant_isolation on "weddings"
  for all
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and (
      nullif(current_setting('app.wedding_id', true), '') is null
      or id = nullif(current_setting('app.wedding_id', true), '')::uuid
    )
  )
  with check (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and (
      nullif(current_setting('app.wedding_id', true), '') is null
      or id = nullif(current_setting('app.wedding_id', true), '')::uuid
    )
  );
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- The standard tenant tables: both keys, single-column checks, no joins.
--
-- `invitations` and `audit_log` have a NULLABLE wedding_id. The interaction is
-- deliberate: a couple's principal always sets app.wedding_id, so for an org-level
-- row where wedding_id IS NULL the comparison yields NULL and the row is filtered.
-- A couple therefore never sees staff invitations or org-level audit entries, and it
-- falls out of the policy rather than needing a special case.
-- ---------------------------------------------------------------------------
create policy tenant_isolation on "invitations"
  for all
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and (
      nullif(current_setting('app.wedding_id', true), '') is null
      or wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    )
  )
  with check (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and (
      nullif(current_setting('app.wedding_id', true), '') is null
      or wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    )
  );
--> statement-breakpoint

create policy tenant_isolation on "wedding_domains"
  for all
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and (
      nullif(current_setting('app.wedding_id', true), '') is null
      or wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    )
  )
  with check (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and (
      nullif(current_setting('app.wedding_id', true), '') is null
      or wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    )
  );
--> statement-breakpoint

create policy tenant_isolation on "audit_log"
  for all
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and (
      nullif(current_setting('app.wedding_id', true), '') is null
      or wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    )
  )
  with check (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and (
      nullif(current_setting('app.wedding_id', true), '') is null
      or wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    )
  );
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- The two-dimensional tables. THIS IS THE CLAUSE research/05-architecture.md
-- SECTION 4 ORIGINALLY LACKED.
--
-- research/07-auth-and-tenancy.md section 3 establishes that a couple's session must
-- set app.org_id to the PLANNER's org -- it has no choice, or every row is rejected.
-- So a couple's GUCs and a planner's GUCs are identical, and the two clauses above
-- cannot tell them apart. Without the third clause, `tasks.visibility = 'internal'`
-- would be enforced only in application code, with no backstop at all -- for exactly
-- the rows research/09-planner-app.md section b identifies as most damaging to leak:
-- chasing a late invoice, checking a margin, "couple is being difficult about the
-- seating".
--
-- Note how it fails closed. With app.wedding_role unset, the clause is
-- `visibility = 'shared' OR NULL`. For an internal row that is `false OR NULL` =
-- NULL, so the row is filtered. For a shared row it is `true OR NULL` = true. An
-- unset role therefore sees shared rows and never internal ones, which is the safe
-- direction to be wrong in.
-- ---------------------------------------------------------------------------
create policy tenant_isolation on "tasks"
  for all
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and (
      nullif(current_setting('app.wedding_id', true), '') is null
      or wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    )
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
    and (
      visibility = 'shared'
      or nullif(current_setting('app.wedding_role', true), '')
           in ('owner', 'admin', 'member', 'editor')
    )
  );
--> statement-breakpoint

create policy tenant_isolation on "task_comments"
  for all
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and (
      nullif(current_setting('app.wedding_id', true), '') is null
      or wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    )
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
    and (
      visibility = 'shared'
      or nullif(current_setting('app.wedding_role', true), '')
           in ('owner', 'admin', 'member', 'editor')
    )
  );
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- The two deliberate exceptions, on a different axis entirely.
--
-- org_members and wedding_members are read BEFORE the tenant is known, in order to
-- determine it. They therefore cannot be scoped by app.org_id -- that would be
-- circular. They are scoped by app.user_id instead.
--
-- research/07-auth-and-tenancy.md section 4a asks for this comment explicitly, so
-- that the missing org_id on wedding_members does not get "fixed" by a future
-- reader: it is correct. These two tables are the reason the both-keys rule in
-- research/05-architecture.md section 4 says "every tenant-scoped table" rather than
-- "every table".
--
-- And note what this makes impossible: resolving somebody else's memberships. A
-- session cannot ask "which weddings does user X belong to" for any X but itself,
-- which is the query an attacker would want most.
-- ---------------------------------------------------------------------------
create policy own_memberships on "org_members"
  for all
  using       (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  with check  (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
--> statement-breakpoint

create policy own_memberships on "wedding_members"
  for all
  using       (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  with check  (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- task_comments inherits its tenancy AND its visibility from its parent task, in
-- the database rather than in application code.
--
-- Why the column exists at all: a policy on task_comments that had to join to tasks
-- to discover whether the parent is internal would defeat the single-column-check
-- design. And without the column there is no backstop -- a couple could read the
-- comment thread on an internal task even though the task itself is invisible to
-- them, which leaks more than the task title would.
--
-- Why a trigger rather than application code: it removes the entire class of bug
-- where a task is flipped to `internal` and its existing comments stay `shared`.
-- There is no code path, including a hand-written UPDATE in a console, that can
-- desynchronise them.
--
-- SECURITY INVOKER (the default) is deliberate: the lookup runs under the caller's
-- policies, so a comment cannot be attached to a task the caller cannot see.
-- ---------------------------------------------------------------------------
create or replace function gn_task_comment_inherit() returns trigger
language plpgsql as $$
declare
  v_visibility text;
  v_org_id     uuid;
  v_wedding_id uuid;
begin
  select t.visibility, t.org_id, t.wedding_id
    into v_visibility, v_org_id, v_wedding_id
    from tasks t
   where t.id = new.task_id;

  if not found then
    raise exception
      'task_comments.task_id % does not exist or is not visible in this tenant context',
      new.task_id;
  end if;

  new.visibility  := v_visibility;
  new.org_id      := v_org_id;
  new.wedding_id  := v_wedding_id;
  return new;
end
$$;
--> statement-breakpoint

create trigger task_comments_inherit_from_task
  before insert or update of task_id on "task_comments"
  for each row execute function gn_task_comment_inherit();
--> statement-breakpoint

create or replace function gn_task_visibility_propagate() returns trigger
language plpgsql as $$
begin
  update task_comments
     set visibility = new.visibility,
         updated_at = now()
   where task_id = new.id
     and visibility is distinct from new.visibility;
  return null;
end
$$;
--> statement-breakpoint

create trigger tasks_propagate_visibility
  after update of visibility on "tasks"
  for each row
  when (old.visibility is distinct from new.visibility)
  execute function gn_task_visibility_propagate();
