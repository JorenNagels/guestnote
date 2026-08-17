-- Grants for the application role.
--
-- Separated from 0001 on purpose: policies must not depend on a role existing.
-- 0001 names no role (no `TO app_user`), so its policies apply to everyone and can be
-- applied to any database. This file is the only place that knows about `app_user`.
--
-- Why a separate role at all, when 0001 already sets FORCE ROW LEVEL SECURITY?
-- Because FORCE only removes the table OWNER's exemption. It does nothing about a
-- role with BYPASSRLS, and nothing about a superuser. On a managed Postgres the
-- tempting path is to connect as the owner and rely on FORCE -- which works right up
-- until someone grants that role BYPASSRLS to debug something at 23:00 and every
-- policy in this schema silently stops applying, with no error and no failing test.
--
-- So the application connects as a role that is:
--   * not the owner of any table,
--   * NOBYPASSRLS,
--   * not a superuser,
--   * and has no DDL rights, so it cannot disable RLS on a table either.
--
-- test/pooling.test.ts asserts all of that about whatever role the tests actually
-- connect as, rather than trusting that this file was run.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    raise exception
      'Role app_user does not exist. Create it before migrating, and NOT as the '
      'table owner: CREATE ROLE app_user LOGIN PASSWORD ''...'' NOBYPASSRLS; '
      'On Neon this is a separate role created through the console or API, and the '
      'application connection string must use it rather than the project owner.';
  end if;
end
$$;
--> statement-breakpoint

grant usage on schema public to app_user;
--> statement-breakpoint

grant select, insert, update, delete on all tables in schema public to app_user;
--> statement-breakpoint

-- Future tables too, so that adding a table cannot silently leave the application
-- without access -- or, worse, tempt someone into connecting as the owner instead.
alter default privileges in schema public
  grant select, insert, update, delete on tables to app_user;
--> statement-breakpoint

-- Deliberately NOT granted: CREATE on the schema, and ownership of anything. A role
-- that can ALTER TABLE can also `DISABLE ROW LEVEL SECURITY`, which would make every
-- policy in 0001 decorative.
revoke create on schema public from app_user;
