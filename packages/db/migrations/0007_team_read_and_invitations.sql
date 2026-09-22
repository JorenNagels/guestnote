-- Two things the Team screen (spec 0003, slice S6) could not build without, in one file
-- because they ship together: an org-wide READ of memberships for owner and admin, and the
-- two SECURITY DEFINER functions behind `/invite/<token>`.
--
-- Hand-written, for the reason 0001_rls.sql gives. No table changes, so there is no
-- drizzle-kit snapshot for this migration: `invitations` already has everything the
-- functions need (`token_hash`, `expires_at`, `accepted_at`).
--
-- ===========================================================================
-- Part 1. Owner and admin read every membership of their org.
-- ===========================================================================
--
-- ## The gap
--
-- `org_members` and `wedding_members` carry one policy each, `own_memberships`
-- (`user_id = app.user_id`, 0001), so a Team list read through `withTenant` returns the
-- signed-in owner's OWN row and nobody else's. S6's `listTeam` was written against the
-- intended policy and needs no change once this exists.
--
-- ## Why the guard is the predicate itself, and what was checked
--
-- 0005 taught this file's lesson: Postgres ORs permissive policies, and a second policy is
-- live in EVERY transaction shape, not only the one it was written for. 0005's policy keyed
-- on `app.user_id`, which `withTenant` also sets, so it leaked into tenant reads.
--
-- This one is keyed on `app.org_id`, so the shape it applies to is "a tenant transaction",
-- and the shape it must NOT apply to is `withUser`'s, which sets `app.org_id` to ''. The
-- predicate is `org_id = nullif(current_setting('app.org_id', true), '')::uuid`, which is
-- NULL when the GUC is unset or blank, so the policy contributes nothing under `withUser`
-- and `resolveMemberships` / `listOrgsForUser` still read exactly one user's own rows.
-- There is no separate `app.org_id is not null` clause because the comparison already is
-- one, and a second copy of the same fact is a second place to get it wrong. Asserted in
-- isolation.test.ts section 9, with the mutation that proves it.
--
-- Three further clauses narrow it, all on GUCs `withTenant` sets:
--
--   * `app.wedding_role in ('owner', 'admin')`. A `member` has no org-wide principal
--     (`principalForOrg` returns null for them), a couple and an editor are never staff.
--     This is the one place a policy reads the role as a PERMISSION rather than as data
--     scoping, and it is consistent with every planner table since 0006, which already
--     gate on `app.wedding_role`.
--   * `app.wedding_id` is unset. An owner pinned to one wedding is a shape `withTenant`
--     refuses to build (`assertScoped`), but a hand-set GUC bundle can, and pinning is
--     exactly the statement "this session sees one wedding".
--   * (`wedding_members` only) the wedding belongs to that org, through `weddings`, whose
--     own `tenant_isolation` policy applies inside the subquery. `wedding_members` has no
--     `org_id`, on purpose (0001), so the org comes from the wedding. Which half of that
--     `exists` holds the line, measured 2026-09-21 on the local container: deleting the
--     `exists` leaks other orgs' rows and isolation.test.ts section 9 catches it; deleting
--     just the `weddings.org_id = app.org_id` comparison changes nothing, because Postgres
--     applies `weddings`' own `tenant_isolation` inside the subquery. The comparison stays
--     as intent, on the argument 0005 makes for its own redundant clause.
--
-- FOR SELECT, never FOR ALL. Writes stay on `own_memberships`, so an owner still cannot
-- insert, demote or remove a colleague through RLS. That is a separate decision (role
-- change and removal are not built) and this file does not smuggle it in.
--
-- ## The cost, stated rather than discovered
--
-- Any FUTURE `withTenant` query on either table now returns every member of the org to an
-- owner or admin, where it used to return one row. Nothing does today: both existing
-- readers use `withUser`. But a query written as "my role in this org" inside `withTenant`
-- would get several rows and take `rows[0]`, which is the 0005 bug over again. It must
-- carry `eq(user_id, principal.userId)` itself; the policy is the boundary between orgs,
-- not a filter to the caller.
--
-- `schema-coverage.test.ts` names both policies in `USER_SCOPED_POLICY_EXCEPTIONS`, and the
-- exemption now says WHICH key each one must scope by, so a policy renamed into the set
-- but scoping by neither still fails.

create policy org_staff_read on "org_members"
  for select
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and nullif(current_setting('app.wedding_id', true), '') is null
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin')
  );
--> statement-breakpoint

create policy org_staff_read on "wedding_members"
  for select
  using (
    nullif(current_setting('app.wedding_id', true), '') is null
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin')
    and exists (
      select 1
        from weddings
       where weddings.id = wedding_members.wedding_id
         and weddings.org_id = nullif(current_setting('app.org_id', true), '')::uuid
    )
  );
--> statement-breakpoint

-- ===========================================================================
-- Part 2. Reading and accepting an invitation before any principal exists.
-- ===========================================================================
--
-- ## Why a function and not a query
--
-- Reading `invitations` by token happens when the visitor has no session, and accepting it
-- writes the first `org_members` row they will ever have. Both are refused by design:
--
--   * `tenant_isolation` on `invitations` needs `app.org_id`, which is the thing the token
--     is used to LEARN.
--   * Building accept from `withUser` plus an INSERT does not work either, and it is worse
--     than "does not work": `own_memberships`' WITH CHECK is only `user_id = app.user_id`,
--     so it would let ANY signed-in user insert THEMSELVES into ANY org whose uuid they can
--     name, no invitation required. 0001's comment says accepting writes "the invitee's own
--     row, which is exactly what WITH CHECK permits", which describes the mechanism and
--     misses that nothing checks the invitation. That gap is why accept is a function.
--   * A third unscoped reader in `lib/db.ts` is what CLAUDE.md invariant 1 says to stop at.
--
-- SECURITY DEFINER is the shape spec 0003 already chose for `vendor_links`. Each function
-- is the whole of its door: it checks the token, and everything it writes it derives from
-- the invitation row, never from an argument, so a caller cannot choose the org.
--
-- ## It relies on the OWNER bypassing RLS -- and refuses to install if it does not
--
-- `invitations`, `org_members` and `weddings` are FORCE ROW LEVEL SECURITY, so a definer
-- function is subject to their policies like anyone else UNLESS its owner is a superuser or
-- has BYPASSRLS. Locally the owner is `postgres`; on Neon it is `neondb_owner`, which has
-- `rolbypassrls = true` (CLAUDE.md invariant 10, docs/adr/0001). That is a property of the
-- environment and not of this file, and if it were false the functions would install fine
-- and then return no row for any token, which reads as "every invitation link is
-- expired". So the block below makes it a migration-time error with the reason attached.
-- Rejected: a policy on `invitations` keyed on a token GUC, which needs no bypass but adds
-- a second way to read the table and still cannot write `org_members`.
--
-- ## The other traps a definer function has
--
--   * `set search_path = ''` and every object schema-qualified. Without it the function
--     resolves `invitations` through the CALLER's search_path, so a role that can create a
--     table of that name in a schema it controls could substitute its own and have this
--     function, running as the owner, read and write it.
--   * `revoke ... from public`. New functions are executable by PUBLIC by default, which
--     is the opposite of the grant discipline in 0002. Only `app_user` may call these.
--   * They return plain rows and raise nothing for a refusal: the outcome is data, so the
--     app can render each state, and an exception would roll the whole transaction back.
--
-- ## The token
--
-- `token_hash = lower(hex(sha256(token)))`, the token being 32 random bytes as base64url.
-- The hash is computed in the application (`packages/core/src/auth/invitations.ts`) and
-- arrives here already hashed, so the plaintext token never enters a query, a log or a
-- pg_stat_statements row. 256 bits of entropy means no salt and no slow hash.
--
-- "Revoked" is a deleted row: `revokeStaffInvite` deletes rather than flags, so a revoked
-- token is indistinguishable from one that never existed, and that is one outcome
-- ('unknown') on purpose, for the same enumeration reason the interface renders it.

do $$
begin
  if not exists (
    select 1 from pg_roles
     where rolname = current_user and (rolsuper or rolbypassrls)
  ) then
    raise exception
      'Role % cannot bypass RLS, so the SECURITY DEFINER functions in this migration would '
      'silently find no invitation for any token (invitations is FORCE ROW LEVEL SECURITY). '
      'Apply migrations as the table owner with BYPASSRLS -- neondb_owner on Neon, postgres '
      'locally. See 0007_team_read_and_invitations.sql, "It relies on the OWNER".',
      current_user;
  end if;
end
$$;
--> statement-breakpoint

-- What the landing screen needs, and nothing that identifies the invitation beyond it.
-- Zero rows for an unknown token. `status` is computed here, with the database's clock,
-- so the app and the accept function below cannot disagree about "expired".
create or replace function public.resolve_invitation(p_token_hash text)
returns table (
  invitation_id uuid,
  org_id uuid,
  org_name text,
  wedding_id uuid,
  email text,
  role text,
  inviter_name text,
  status text
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
         end
    from public.invitations i
    join public.organizations o on o.id = i.org_id and o.deleted_at is null
    left join public.users u on u.id = i.invited_by
   where i.token_hash = p_token_hash
$$;
--> statement-breakpoint

-- Accept: the checks and the writes in one transaction, so a token cannot be spent without
-- a membership or grant a membership without spending the token. `for update` on the
-- invitation makes two simultaneous accepts serialise, and the second sees `accepted_at`.
--
-- The OUT columns are prefixed `joined_` because in plpgsql an OUT parameter is a variable,
-- and one named `org_id` would collide with the column of the same name in every statement
-- below.
--
-- `p_user_id` must equal `app.user_id`, i.e. the caller must have entered through
-- `withUser` as that user. The token plus the email match are what authorise the accept;
-- this makes a Server Function that passes the wrong id fail closed instead of enrolling
-- somebody else. It does not stand against a caller who can set the GUC themselves, which
-- would need the database connection already, so it is a seatbelt and not a boundary.
--
-- What a staff invitation writes is `org_members` ONLY, and a wedding invitation writes
-- `wedding_members` ONLY -- never both. Accepting a wedding invite must not create an
-- `org_members` row: a principal with one is org-wide staff, which is exactly how a couple
-- would read the planner's whole book (CLAUDE.md invariant 3). `invitations_scope_role_check`
-- already ties staff roles to `wedding_id is null`, so the branch below cannot be steered by
-- an argument.
--
-- `on conflict do nothing` keeps an EXISTING membership as it is. An owner accepting an
-- invitation to `member` (a race with the duplicate check in the invite action) must not be
-- demoted by it; the token is still spent and the caller is told the role they hold.
create or replace function public.accept_invitation(p_token_hash text, p_user_id uuid)
returns table (
  outcome text,
  joined_org_id uuid,
  joined_wedding_id uuid,
  joined_role text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv   public.invitations%rowtype;
  v_email text;
  v_role  text;
begin
  if p_user_id is null
     or nullif(current_setting('app.user_id', true), '')::uuid is distinct from p_user_id then
    return query select 'forbidden'::text, null::uuid, null::uuid, null::text;
    return;
  end if;

  select i.* into v_inv
    from public.invitations i
   where i.token_hash = p_token_hash
     for update;

  -- Not found, and an organisation that has been soft-deleted since, are one outcome.
  if not found or not exists (
    select 1 from public.organizations o where o.id = v_inv.org_id and o.deleted_at is null
  ) then
    return query select 'unknown'::text, null::uuid, null::uuid, null::text;
    return;
  end if;

  if v_inv.accepted_at is not null then
    return query select 'already_accepted'::text, null::uuid, null::uuid, null::text;
    return;
  end if;

  if v_inv.expires_at <= now() then
    return query select 'expired'::text, null::uuid, null::uuid, null::text;
    return;
  end if;

  -- An unknown user id is treated as the wrong user, not as a separate outcome.
  select u.email into v_email from public.users u where u.id = p_user_id;
  if v_email is null or lower(v_email) <> lower(v_inv.email) then
    return query select 'wrong_user'::text, null::uuid, null::uuid, null::text;
    return;
  end if;

  if v_inv.wedding_id is null then
    insert into public.org_members (org_id, user_id, role, invited_by)
    values (v_inv.org_id, p_user_id, v_inv.role, v_inv.invited_by)
    on conflict do nothing;

    select m.role into v_role
      from public.org_members m
     where m.org_id = v_inv.org_id and m.user_id = p_user_id;
  else
    -- The invitation names a wedding, so that wedding must be in the invitation's org and
    -- alive. `invitations.wedding_id` has no foreign key, so nothing else says so: without
    -- this a row carrying org A and a wedding of org B would grant access across orgs.
    if not exists (
      select 1 from public.weddings w
       where w.id = v_inv.wedding_id and w.org_id = v_inv.org_id and w.deleted_at is null
    ) then
      return query select 'unknown'::text, null::uuid, null::uuid, null::text;
      return;
    end if;

    insert into public.wedding_members (wedding_id, user_id, role)
    values (v_inv.wedding_id, p_user_id, v_inv.role)
    on conflict do nothing;

    select m.role into v_role
      from public.wedding_members m
     where m.wedding_id = v_inv.wedding_id and m.user_id = p_user_id;
  end if;

  update public.invitations set accepted_at = now() where id = v_inv.id;

  return query select 'accepted'::text, v_inv.org_id, v_inv.wedding_id, v_role;
end
$$;
--> statement-breakpoint

revoke all on function public.resolve_invitation(text) from public;
--> statement-breakpoint
revoke all on function public.accept_invitation(text, uuid) from public;
--> statement-breakpoint
grant execute on function public.resolve_invitation(text) to app_user;
--> statement-breakpoint
grant execute on function public.accept_invitation(text, uuid) to app_user;
