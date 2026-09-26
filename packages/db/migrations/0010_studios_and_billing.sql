-- Spec 0005 (start a studio without an invitation): the columns a self-serve studio, its logo
-- and its (switched-off) billing need, and the four SECURITY DEFINER functions that open doors
-- no principal can open yet. The top is drizzle-kit generated from `schema/orgs.ts`; the tail
-- is hand-written, in the same file for 0006's reason -- deploy.yml applies each file in its own
-- transaction, and a failure between two files would leave half a feature installed.
--
-- ## The columns
--
-- All nullable, all on `organizations`, no policy change: `tenant_isolation` (0001) and
-- `org_read_for_members` (0005) cover new columns as they cover the row. That second policy
-- admits the WHOLE row to any member under `withUser`, so the billing columns are hidden from a
-- member by a select list only, exactly as `plan` and `subscription_status` already are
-- (`listOrgsForUser`'s header). `repos/studios.ts`' `billingProfile` is the one reader of them,
-- and it takes an owner/admin principal from `principalForOrg` before any SQL runs.
--
-- `mollie_customer_id` and `subscription_status` are left alone: the provider is not chosen,
-- and dropping them is a separate cleanup once it is (spec 0005, Data).
ALTER TABLE "organizations" ADD COLUMN "logo_key" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "billing_cycle" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "billing_status" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "billing_name" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "billing_email" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "vat_number" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "billing_customer_id" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "billing_subscription_id" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_billing_cycle_check" CHECK (billing_cycle in ('monthly', 'yearly'));--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_billing_status_check" CHECK (billing_status in ('trialing', 'active', 'past_due', 'canceled'));
--> statement-breakpoint

-- ===========================================================================
-- The functions. Same shape as 0007's, for 0007's reasons, which are not repeated here:
-- `set search_path = ''` with everything schema-qualified, `revoke all ... from public`,
-- `grant execute ... to app_user` alone, and refusals returned as data rather than raised.
-- ===========================================================================
--
-- They work only because their OWNER bypasses RLS on FORCE tables (`organizations`,
-- `org_members`, `invitations`, `weddings`). Installed by a role that cannot, they would
-- install cleanly and then find nothing and write nothing -- `create_studio` would fail every
-- sign-up with an RLS error and `my_pending_invitations` would say nobody is ever invited. So,
-- like 0007, this refuses to install at all.
do $$
begin
  if not exists (
    select 1 from pg_roles
     where rolname = current_user and (rolsuper or rolbypassrls)
  ) then
    raise exception
      'Role % cannot bypass RLS, so the SECURITY DEFINER functions in this migration would '
      'silently find and write nothing (organizations, org_members and invitations are FORCE '
      'ROW LEVEL SECURITY). Apply migrations as the table owner with BYPASSRLS -- neondb_owner '
      'on Neon, postgres locally. See 0007_team_read_and_invitations.sql, "It relies on the OWNER".',
      current_user;
  end if;
end
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- create_studio: the first `organizations` row a user makes for themselves.
-- ---------------------------------------------------------------------------
--
-- Why a function: `withUser` plus two INSERTs cannot work. `organizations`' only write policy
-- is `id = app.org_id`, and `org_members`' is `user_id = app.user_id` -- which, as 0007 says,
-- would let any signed-in user insert THEMSELVES into ANY org. Creating an org and becoming its
-- owner has to be one door, and the door is what decides who may walk through it. Rejected: a
-- third sanctioned unscoped writer in `lib/db.ts` (CLAUDE.md invariant 1 says to stop there).
--
-- What it decides:
--
--   * `p_user_id` must equal `app.user_id`, as in `accept_invitation`: a Server Function that
--     passes the wrong id fails closed ('forbidden') instead of making somebody else an owner.
--   * **One studio per owner** ('already_owner'), counted over LIVE orgs, so a studio that has
--     been soft-deleted does not block a new one. The users row is locked `for update` first,
--     so two simultaneous submits from one user serialise and the second sees the first's
--     owner row: a double-click creates one studio (spec 0005, Sign-up, step 4). An admin or
--     member of someone else's studio may still create their own.
--   * The org id is `p_org_id`, a UUIDv7 made by the app's `newId()` (CLAUDE.md invariant 9);
--     an id that already exists raises (primary key), which is a bug and not an outcome.
--   * The slug is `p_slug_base`, then `-2`, `-3`, ... among LIVE orgs (the unique index is
--     partial, `organizations_slug_key`). The app cleans the base (`lib/slug.ts`: ASCII, a DNS
--     label, not a label `hosts.ts` reserves); this only checks it is label-shaped, because a
--     function that trusted a blank or free-text slug would store one. A suffix cannot turn a
--     clean base into a reserved word -- none ends in `-<digits>`. A slug taken between the
--     existence check and the insert (two strangers naming their studio alike at the same
--     moment) is caught as that one constraint's violation and the loop moves on; any other
--     unique violation re-raises.
--   * `users.name` becomes `p_owner_name` when that is not blank. Blank leaves the name as it
--     is, so a Google sign-up that already carries a name is not wiped by an empty field.
--
-- Nothing is org-slug-visible today (tenant hosts are wedding slugs), so the slug is never
-- shown or edited; it exists because the column is NOT NULL and unique.
create or replace function public.create_studio(
  p_org_id uuid,
  p_user_id uuid,
  p_name text,
  p_slug_base text,
  p_owner_name text
)
returns table (
  outcome text,
  created_org_id uuid,
  created_slug text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name       text := btrim(coalesce(p_name, ''));
  v_owner_name text := btrim(coalesce(p_owner_name, ''));
  v_slug       text;
  v_n          integer := 1;
  v_constraint text;
begin
  if p_user_id is null
     or nullif(current_setting('app.user_id', true), '')::uuid is distinct from p_user_id then
    return query select 'forbidden'::text, null::uuid, null::text;
    return;
  end if;

  -- 80 is spec 0005's studio-name limit; 120 bounds a display name nobody types by hand.
  if p_org_id is null
     or char_length(v_name) not between 1 and 80
     or char_length(v_owner_name) > 120
     or p_slug_base is null
     or p_slug_base !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' then
    return query select 'invalid'::text, null::uuid, null::text;
    return;
  end if;

  -- The serialisation point for "one studio per owner". An unknown user is 'forbidden': the
  -- GUC matched, so this is a session for a user row that no longer exists.
  perform 1 from public.users u where u.id = p_user_id for update;
  if not found then
    return query select 'forbidden'::text, null::uuid, null::text;
    return;
  end if;

  if exists (
    select 1
      from public.org_members m
      join public.organizations o on o.id = m.org_id and o.deleted_at is null
     where m.user_id = p_user_id and m.role = 'owner'
  ) then
    return query select 'already_owner'::text, null::uuid, null::text;
    return;
  end if;

  loop
    v_slug := case when v_n = 1 then p_slug_base else p_slug_base || '-' || v_n end;
    if not exists (
      select 1 from public.organizations o where o.slug = v_slug and o.deleted_at is null
    ) then
      begin
        insert into public.organizations (id, slug, name, type)
        values (p_org_id, v_slug, v_name, 'planner');
        exit;
      exception when unique_violation then
        get stacked diagnostics v_constraint = constraint_name;
        if v_constraint is distinct from 'organizations_slug_key' then
          raise;
        end if;
      end;
    end if;
    v_n := v_n + 1;
    if v_n > 1000 then
      raise exception 'create_studio: no free slug for base % after 1000 tries', p_slug_base;
    end if;
  end loop;

  insert into public.org_members (org_id, user_id, role)
  values (p_org_id, p_user_id, 'owner');

  if v_owner_name <> '' then
    update public.users set name = v_owner_name, updated_at = now() where id = p_user_id;
  end if;

  return query select 'created'::text, p_org_id, v_slug;
end
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- my_pending_invitations: "You've been invited", after the code is verified.
-- ---------------------------------------------------------------------------
--
-- Matched against the email on the CALLER's own `users` row, and there is no email argument
-- on purpose: a function taking an address would answer "is this address invited?" for any
-- address, which is exactly the probe spec 0005 rules out. The row is only reachable by
-- having verified that address's sign-in code. `p_user_id` must equal `app.user_id` (else no
-- rows), the same seatbelt as `accept_invitation`.
--
-- Pending means unaccepted and unexpired, on the database clock; a revoked invitation is a
-- deleted row and simply absent. The org must be live, and a wedding invitation's wedding must
-- be live AND in the invitation's org -- `invitations.wedding_id` has no foreign key, so the
-- same check `accept_invitation` makes is repeated here, and an invitation that could only be
-- refused is not offered. `wedding_name` is the couple's display name, the name a planner
-- knows a wedding by. Nothing here identifies the invitation beyond its id, which is what
-- `accept_invitation_by_id` takes; the token hash never leaves the table.
create or replace function public.my_pending_invitations(p_user_id uuid)
returns table (
  invitation_id uuid,
  org_id uuid,
  org_name text,
  wedding_id uuid,
  wedding_name text,
  role text,
  inviter_name text,
  expires_at timestamptz
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
         w.couple_display_name,
         i.role,
         inviter.name,
         i.expires_at
    from public.users me
    join public.invitations i on lower(i.email) = lower(me.email)
    join public.organizations o on o.id = i.org_id and o.deleted_at is null
    left join public.weddings w
           on w.id = i.wedding_id and w.org_id = i.org_id and w.deleted_at is null
    left join public.users inviter on inviter.id = i.invited_by
   where me.id = p_user_id
     and p_user_id = nullif(current_setting('app.user_id', true), '')::uuid
     and i.accepted_at is null
     and i.expires_at > now()
     and (i.wedding_id is null or w.id is not null)
   order by i.created_at, i.id
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- accept_invitation_by_id: Join, from the invited screen.
-- ---------------------------------------------------------------------------
--
-- A thin door onto 0007's `accept_invitation`, not a copy of it: the id is turned into the
-- token hash here and every other check and write -- expiry, single use, the email match, the
-- staff/wedding branch, spending the token -- is that function's, so the two cannot drift.
--
-- The lookup matches the id AND the caller's own email. An invitation addressed to someone
-- else is 'unknown', not 'wrong_user': the by-id path must not tell a caller who guessed or
-- was handed an id that it exists, or whether it has expired or been used, when it was never
-- theirs. (By token the distinction is fine -- holding the token is already knowing it
-- exists.) `accept_invitation` then re-checks the email itself, so the match is made twice.
create or replace function public.accept_invitation_by_id(p_invitation_id uuid, p_user_id uuid)
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
  v_hash text;
begin
  if p_user_id is null
     or nullif(current_setting('app.user_id', true), '')::uuid is distinct from p_user_id then
    return query select 'forbidden'::text, null::uuid, null::uuid, null::text;
    return;
  end if;

  select i.token_hash into v_hash
    from public.invitations i
    join public.users u on u.id = p_user_id
   where i.id = p_invitation_id
     and lower(i.email) = lower(u.email);

  if v_hash is null then
    return query select 'unknown'::text, null::uuid, null::uuid, null::text;
    return;
  end if;

  return query select * from public.accept_invitation(v_hash, p_user_id);
end
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- orgs_with_trial_ending: the trial-reminder cron's one read.
-- ---------------------------------------------------------------------------
--
-- The cron runs with no principal and has to find orgs across every tenant, so it cannot be a
-- query. It returns four columns and nothing else -- org id, name, the trial's last day, one
-- owner's email -- because that is all a reminder needs, and this is the only cross-tenant
-- read in the schema. Only planner orgs, only live ones, only while `billing_status` is null
-- or 'trialing' (a paying studio is not reminded).
--
-- The trial's LAST DAY, as a Europe/Brussels calendar date (spec 0005, Trial): the trial runs
-- to the end of that day. It is `trial_ends_at`'s Brussels date when an override is set, else
-- `greatest(created_at's Brussels date, p_billing_from) + 1 month`. Postgres clamps a month
-- that has no such day (31 January + 1 month = 28 or 29 February); `lib/trial.ts` must compute
-- the same, and its tests pin the end-of-month cases. Returned as `YYYY-MM-DD` text, not
-- `date`, for 0008's reason: node-postgres turns a `date` into a JS Date at local midnight.
--
-- `p_billing_from` null returns nothing: billing off is the safe value (CLAUDE.md invariant
-- 6), and no reminder is ever sent for a trial that is not running. The cron also checks.
--
-- One row per org, not per owner: the earliest owner row (the studio's creator). Several
-- owners is possible in the schema and not reachable in the app today.
create or replace function public.orgs_with_trial_ending(p_on date, p_billing_from date)
returns table (
  org_id uuid,
  org_name text,
  trial_ends_on text,
  owner_email text
)
language sql
stable
security definer
set search_path = ''
as $$
  with trials as (
    select o.id,
           o.name,
           coalesce(
             (o.trial_ends_at at time zone 'Europe/Brussels')::date,
             (greatest((o.created_at at time zone 'Europe/Brussels')::date, p_billing_from)
               + interval '1 month')::date
           ) as ends_on
      from public.organizations o
     where o.deleted_at is null
       and o.type = 'planner'
       and (o.billing_status is null or o.billing_status = 'trialing')
       and p_billing_from is not null
  )
  select t.id, t.name, t.ends_on::text, owner.email
    from trials t
    cross join lateral (
      select u.email
        from public.org_members m
        join public.users u on u.id = m.user_id
       where m.org_id = t.id and m.role = 'owner'
       order by m.created_at, m.user_id
       limit 1
    ) owner
   where t.ends_on = p_on
   order by t.id
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- resolve_vendor_link, again (0008), with the studio's `logo_key` appended.
-- ---------------------------------------------------------------------------
--
-- The vendor-link page shows the studio's logo in its header (spec 0005, Studio logo). A
-- function's return type cannot be changed by `create or replace`, so it is dropped and made
-- again -- which drops its grants too, hence the revoke and grant after it. The column is
-- APPENDED so the running app, which maps named columns off `select *`, reads the new shape
-- unchanged during the deploy window (migrations run before the code, deploy.yml). Everything
-- else is 0008's body, verbatim; read 0008 Part 1 for its reasoning.
drop function public.resolve_vendor_link(text);
--> statement-breakpoint

create function public.resolve_vendor_link(p_token_hash text)
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
  status text,
  logo_key text
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
         end,
         o.logo_key
    from public.vendor_links vl
    join public.wedding_vendors wv on wv.id = vl.wedding_vendor_id and wv.deleted_at is null
    join public.vendors v on v.id = wv.vendor_id
    join public.weddings w on w.id = vl.wedding_id and w.deleted_at is null
    join public.organizations o on o.id = vl.org_id and o.deleted_at is null
   where vl.token_hash = p_token_hash
$$;
--> statement-breakpoint

revoke all on function public.create_studio(uuid, uuid, text, text, text) from public;
--> statement-breakpoint
revoke all on function public.my_pending_invitations(uuid) from public;
--> statement-breakpoint
revoke all on function public.accept_invitation_by_id(uuid, uuid) from public;
--> statement-breakpoint
revoke all on function public.orgs_with_trial_ending(date, date) from public;
--> statement-breakpoint
revoke all on function public.resolve_vendor_link(text) from public;
--> statement-breakpoint
grant execute on function public.create_studio(uuid, uuid, text, text, text) to app_user;
--> statement-breakpoint
grant execute on function public.my_pending_invitations(uuid) to app_user;
--> statement-breakpoint
grant execute on function public.accept_invitation_by_id(uuid, uuid) to app_user;
--> statement-breakpoint
grant execute on function public.orgs_with_trial_ending(date, date) to app_user;
--> statement-breakpoint
grant execute on function public.resolve_vendor_link(text) to app_user;
