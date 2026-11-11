-- =============================================================================
-- Zikr & Namaz Tracker: schema, constraints, RLS and privileges
-- Writes to every log / friendship / challenge table happen ONLY through the
-- SECURITY DEFINER functions in 20261111000002_functions.sql.
-- =============================================================================

-- gen_random_uuid() is built into Postgres 13+; no extension needed.

-- Helpers that take a user id (and could leak data) live in a schema that
-- PostgREST does not expose. Only RLS helpers get EXECUTE for clients.
create schema if not exists app_private;
revoke all on schema app_private from public;

-- -----------------------------------------------------------------------------
-- Clock. Production = server now(). Tests replace this function inside a
-- rolled-back transaction to simulate other moments in time.
-- -----------------------------------------------------------------------------
-- plpgsql (not SQL) so it is never inlined into cached plans as a constant.
create or replace function app_private.now()
returns timestamptz
language plpgsql stable
as $$ begin return now(); end $$;

create or replace function app_private.default_settings()
returns jsonb
language sql immutable
as $$
  select jsonb_build_object(
    'city', 'Mumbai', 'country', 'India', 'method', 1, 'asr', 'standard',
    'azanAlert', true, 'jamaatNudge', true, 'azkarReminder', false,
    'smartFix', true, 'smartFixChoice', null,
    'shareStats', true, 'shareHeatmap', false, 'shareQuran', false,
    'weeklyReport', true, 'showHadith', true
  )
$$;

create or replace function app_private.is_valid_timezone(p_tz text)
returns boolean
language sql stable
as $$ select p_tz is not null and exists (select 1 from pg_timezone_names where name = p_tz) $$;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  timezone    text not null default 'Asia/Kolkata',
  settings    jsonb not null default app_private.default_settings()
              check (jsonb_typeof(settings) = 'object'),
  created_at  timestamptz not null default now()
);

create table public.prayer_logs (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  log_date    date not null,
  prayer      text not null check (prayer in ('fajr','dhuhr','asr','maghrib','isha')),
  status      text check (status in ('jamaat','alone','qaza','missed')),  -- null = cleared
  eligible    boolean not null,
  edited      boolean not null default false,
  points      int not null default 0 check (points in (0, 2, 4, 10)),
  qaza_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, log_date, prayer),
  -- an edited or ineligible row can never carry points
  check (not edited or points = 0),
  check (eligible or points = 0)
);

create table public.zikr_logs (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  log_date    date not null,
  slot        text not null check (slot in ('morning','evening')),
  done        boolean not null,
  eligible    boolean not null,
  edited      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, log_date, slot)
);

create table public.quran_logs (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  log_date    date not null,
  pages       int not null check (pages between 0 and 604),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, log_date)
);

create table public.nafl_logs (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  log_date    date not null,
  name        text not null check (name ~ '^(duha|tahajjud|witr|sunnah|ishraq|ramadan:(roza|sehri|iftar|sadaqah|taraweeh))$'),
  done        boolean not null,
  value       int check (value between 0 and 20),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, log_date, name),
  check (value is null or name = 'ramadan:taraweeh')
);

-- Pending friend requests are keyed by EMAIL (not user id), so a request to an
-- address without an account looks exactly like one to a real account.
-- This is what makes the "no account enumeration" promise hold for the
-- outgoing list too (see README "Schema refinements").
create table public.friend_requests (
  id          uuid primary key default gen_random_uuid(),
  requester   uuid not null references public.profiles (id) on delete cascade,
  email       text not null check (char_length(email) between 3 and 254 and email = lower(email)),
  created_at  timestamptz not null default now(),
  unique (requester, email)
);

-- Accepted friendships only. One row per pair, either direction.
create table public.friendships (
  id          uuid primary key default gen_random_uuid(),
  requester   uuid not null references public.profiles (id) on delete cascade,
  addressee   uuid not null references public.profiles (id) on delete cascade,
  status      text not null default 'accepted' check (status in ('accepted')),
  created_at  timestamptz not null default now(),
  check (requester <> addressee)
);
create unique index friendships_pair_uniq
  on public.friendships (least(requester, addressee), greatest(requester, addressee));

create table public.challenges (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles (id) on delete cascade,
  type            text not null check (type in ('friend','personal')),
  kind            text not null check (kind in ('namaz','jamaat','zikr','quran')),
  template        text check (template in ('fajr7','jumuah','azkar7','weekend')),
  prayer          text check (prayer in ('fajr','dhuhr','asr','maghrib','isha')),  -- null = all five
  slot            text check (slot in ('morning','evening','both')),
  pages           int  check (pages between 1 and 604),
  weekdays        int[] check (weekdays is null or weekdays <@ array[1,2,3,4,5,6,7]),  -- ISO dow filter
  target          int  not null check (target between 1 and 365),
  title           text not null check (char_length(btrim(title)) between 1 and 80),
  reward          int  not null default 0 check (reward between 0 and 50),
  starts_on       date not null,
  reward_granted  boolean not null default false,
  created_at      timestamptz not null default now(),
  check (type = 'friend' or (reward = 0 and template is null)),
  check (type = 'personal' or template is not null),
  check (kind <> 'zikr'  or slot  is not null),
  check (kind <> 'quran' or pages is not null)
);

create table public.challenge_members (
  challenge_id  uuid not null references public.challenges (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  status        text not null check (status in ('invited','accepted')),
  created_at    timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

-- One row per member when a friend challenge is completed (reward granted once).
create table public.challenge_rewards (
  challenge_id  uuid not null references public.challenges (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  points        int  not null check (points between 0 and 50),
  granted_on    date not null,
  created_at    timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

create table public.badge_defs (
  code        text primary key,
  grp         text not null check (grp in ('namaz','quran','private')),
  name        text not null,
  note        text not null,
  target      int  not null check (target > 0),
  visibility  text not null check (visibility in ('friends','private')),
  sort        int  not null default 0
);

-- -----------------------------------------------------------------------------
-- Indexes (PKs already lead with user_id, log_date; these cover other paths)
-- -----------------------------------------------------------------------------
create index prayer_logs_user_date_idx  on public.prayer_logs (user_id, log_date);
create index zikr_logs_user_date_idx    on public.zikr_logs (user_id, log_date);
create index quran_logs_user_date_idx   on public.quran_logs (user_id, log_date);
create index nafl_logs_user_date_idx    on public.nafl_logs (user_id, log_date);
create index friend_requests_email_idx  on public.friend_requests (email);
create index friendships_requester_idx  on public.friendships (requester);
create index friendships_addressee_idx  on public.friendships (addressee);
create index challenges_owner_idx       on public.challenges (owner_id);
create index challenge_members_user_idx on public.challenge_members (user_id);
create index challenge_rewards_user_idx on public.challenge_rewards (user_id, granted_on);

-- -----------------------------------------------------------------------------
-- New auth user -> profile (name + IANA timezone from signup metadata)
-- -----------------------------------------------------------------------------
create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(new.raw_user_meta_data ->> 'name', ''));
  v_tz   text := new.raw_user_meta_data ->> 'timezone';
begin
  if v_name = '' then
    v_name := split_part(coalesce(new.email, 'Friend'), '@', 1);
  end if;
  v_name := left(v_name, 60);
  if not app_private.is_valid_timezone(v_tz) then
    v_tz := 'Asia/Kolkata';
  end if;
  insert into public.profiles (id, name, timezone)
  values (new.id, v_name, v_tz)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app_private.handle_new_user();

-- -----------------------------------------------------------------------------
-- RLS helpers (callable inside policies; take no user id argument)
-- -----------------------------------------------------------------------------
create or replace function app_private.is_challenge_member(p_challenge uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.challenge_members
                 where challenge_id = p_challenge and user_id = auth.uid())
$$;

create or replace function app_private.is_challenge_owner(p_challenge uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.challenges
                 where id = p_challenge and owner_id = auth.uid())
$$;

-- -----------------------------------------------------------------------------
-- Row Level Security: enabled everywhere, SELECT-only policies.
-- No INSERT/UPDATE/DELETE policies exist, so even if a grant slipped back in,
-- RLS would still refuse direct writes.
-- -----------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.prayer_logs       enable row level security;
alter table public.zikr_logs         enable row level security;
alter table public.quran_logs        enable row level security;
alter table public.nafl_logs         enable row level security;
alter table public.friend_requests   enable row level security;
alter table public.friendships       enable row level security;
alter table public.challenges        enable row level security;
alter table public.challenge_members enable row level security;
alter table public.challenge_rewards enable row level security;
alter table public.badge_defs        enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());

create policy prayer_logs_select_own on public.prayer_logs
  for select to authenticated using (user_id = auth.uid());
create policy zikr_logs_select_own on public.zikr_logs
  for select to authenticated using (user_id = auth.uid());
create policy quran_logs_select_own on public.quran_logs
  for select to authenticated using (user_id = auth.uid());
create policy nafl_logs_select_own on public.nafl_logs
  for select to authenticated using (user_id = auth.uid());

create policy friend_requests_select_own on public.friend_requests
  for select to authenticated using (requester = auth.uid());

create policy friendships_select_party on public.friendships
  for select to authenticated using (auth.uid() in (requester, addressee));

create policy challenges_select_owner_or_member on public.challenges
  for select to authenticated
  using (owner_id = auth.uid() or app_private.is_challenge_member(id));

create policy challenge_members_select on public.challenge_members
  for select to authenticated
  using (user_id = auth.uid()
         or app_private.is_challenge_owner(challenge_id)
         or app_private.is_challenge_member(challenge_id));

create policy challenge_rewards_select_own on public.challenge_rewards
  for select to authenticated using (user_id = auth.uid());

create policy badge_defs_read on public.badge_defs
  for select to authenticated using (true);

-- -----------------------------------------------------------------------------
-- Privileges: anon gets nothing; authenticated gets SELECT only.
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated, public;
grant select on all tables in schema public to authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated, public;
alter default privileges in schema public revoke execute on functions from anon, public;

grant usage on schema app_private to authenticated;
revoke execute on all functions in schema app_private from public, anon, authenticated;
grant execute on function app_private.is_challenge_member(uuid) to authenticated;
grant execute on function app_private.is_challenge_owner(uuid) to authenticated;

-- Supabase Auth inserts into auth.users as supabase_auth_admin; let it reach
-- the signup trigger function (no other private function is granted).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage on schema app_private to supabase_auth_admin;
    grant execute on function app_private.handle_new_user() to supabase_auth_admin;
  end if;
end $$;
