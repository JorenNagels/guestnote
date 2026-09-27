-- Spec 0006 (the public site): which terms a studio's owner accepted, and when. The top is
-- drizzle-kit generated from `schema/orgs.ts`; the tail is hand-written, in the same file for
-- 0006's reason -- deploy.yml applies each file in its own transaction, and a studio table that
-- expects a terms version with a function that cannot write one is half a feature.
--
-- ## The columns
--
-- Both nullable, on `organizations`, no policy change (0010's argument for its columns holds:
-- `tenant_isolation` and `org_read_for_members` cover them as they cover the row). Null is "made
-- before the terms existed" -- every seeded studio and every spec-0005 sign-up before
-- 2026-09-27. Not backfilled: nobody accepted anything, and a backfilled timestamp would be a
-- record of an acceptance that did not happen.
ALTER TABLE "organizations" ADD COLUMN "terms_version" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "terms_accepted_at" timestamp with time zone;
--> statement-breakpoint

-- ===========================================================================
-- create_studio, now with the terms. 0010's function, argument for argument, plus
-- `p_terms_version`: blank or missing is the new outcome 'terms' and writes nothing, so an
-- unticked box fails closed in the database and not only in the form (spec 0006, "Data").
-- Everything else -- the one-studio rule, the slug loop, the owner name -- is 0010's, and its
-- header there still explains it.
--
-- DROP then CREATE, not CREATE OR REPLACE: a new argument makes a new overload, and leaving the
-- five-argument one installed would keep a door open that creates a studio with no terms.
-- Dropping it drops its grants, hence the revoke and grant at the end.
--
-- Same install guard as 0010: a SECURITY DEFINER function owned by a role that cannot bypass
-- RLS installs cleanly and then writes nothing.
-- ===========================================================================
do $$
begin
  if not exists (
    select 1 from pg_roles
     where rolname = current_user and (rolsuper or rolbypassrls)
  ) then
    raise exception
      'Role % cannot bypass RLS, so create_studio would silently write nothing '
      '(organizations and org_members are FORCE ROW LEVEL SECURITY). Apply migrations as the '
      'table owner with BYPASSRLS -- neondb_owner on Neon, postgres locally. See '
      '0010_studios_and_billing.sql.',
      current_user;
  end if;
end
$$;
--> statement-breakpoint

drop function public.create_studio(uuid, uuid, text, text, text);
--> statement-breakpoint

create or replace function public.create_studio(
  p_org_id uuid,
  p_user_id uuid,
  p_name text,
  p_slug_base text,
  p_owner_name text,
  p_terms_version text
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
  v_terms      text := btrim(coalesce(p_terms_version, ''));
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

  -- Spec 0006: no studio without accepted terms. Checked after the shape checks so a
  -- malformed call is still 'invalid', and before any lock, so a refusal costs nothing. 40
  -- bounds a version string (`2026-09-27` today) that nobody types by hand.
  if char_length(v_terms) not between 1 and 40 then
    return query select 'terms'::text, null::uuid, null::text;
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
        insert into public.organizations
          (id, slug, name, type, terms_version, terms_accepted_at)
        values (p_org_id, v_slug, v_name, 'planner', v_terms, now());
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

revoke all on function public.create_studio(uuid, uuid, text, text, text, text) from public;
--> statement-breakpoint
grant execute on function public.create_studio(uuid, uuid, text, text, text, text) to app_user;
