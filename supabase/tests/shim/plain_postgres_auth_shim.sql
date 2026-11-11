-- -----------------------------------------------------------------------------
-- ONLY for running the SQL tests on a plain Postgres (no `supabase start`).
-- Recreates the small part of Supabase the migrations rely on: the roles,
-- the `auth` schema with `auth.users`, and `auth.uid()` reading the JWT claim
-- the same way Supabase does. Never apply this to a Supabase project.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin nologin noinherit;
  end if;
end $$;

create schema if not exists auth;
create schema if not exists extensions;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at         timestamptz default now()
);

create or replace function auth.uid()
returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

grant usage on schema auth to anon, authenticated, supabase_auth_admin;
grant select, insert, update, delete on auth.users to supabase_auth_admin;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
