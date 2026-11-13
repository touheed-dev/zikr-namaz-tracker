-- =============================================================================
-- Migration: 20261113000001_global_leaderboard.sql
-- Opt-in GLOBAL LEADERBOARD with public usernames and add-friend-by-tap.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. profiles.username: nullable, unique case-insensitively, regex check
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists username text;

alter table public.profiles
  drop constraint if exists profiles_username_check;

alter table public.profiles
  add constraint profiles_username_check
  check (username is null or username ~ '^[a-z][a-z0-9_]{2,19}$');

create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username));

-- -----------------------------------------------------------------------------
-- 2. Settings: showOnGlobal boolean default false
-- -----------------------------------------------------------------------------
create or replace function app_private.default_settings()
returns jsonb
language sql immutable
as $$
  select jsonb_build_object(
    'city', 'Mumbai', 'country', 'India', 'method', 1, 'asr', 'standard',
    'azanAlert', true, 'jamaatNudge', true, 'azkarReminder', false,
    'smartFix', true, 'smartFixChoice', null,
    'shareStats', true, 'shareHeatmap', false, 'shareQuran', false,
    'weeklyReport', true, 'showHadith', true,
    'showOnGlobal', false
  )
$$;

-- -----------------------------------------------------------------------------
-- 3. friend_requests: via column ('email' | 'global')
-- -----------------------------------------------------------------------------
alter table public.friend_requests
  add column if not exists via text not null default 'email'
  check (via in ('email', 'global'));

-- -----------------------------------------------------------------------------
-- 4. public.friend_blocks table, RLS and privileges
-- -----------------------------------------------------------------------------
create table if not exists public.friend_blocks (
  blocker     uuid not null references public.profiles (id) on delete cascade,
  blocked     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);

alter table public.friend_blocks enable row level security;

drop policy if exists friend_blocks_select_own on public.friend_blocks;
create policy friend_blocks_select_own on public.friend_blocks
  for select to authenticated using (blocker = auth.uid());

revoke all on table public.friend_blocks from anon, authenticated, public;
grant select on table public.friend_blocks to authenticated;

-- Helper to check if a is blocked by b or b is blocked by a (or specifically blocked by)
create or replace function app_private.is_blocked_by(p_user uuid, p_by uuid)
returns boolean
language sql stable
as $$
  select exists (
    select 1 from public.friend_blocks
    where blocker = p_by and blocked = p_user
  )
$$;

-- Update user_json helper to include username
create or replace function app_private.user_json(p_user uuid)
returns jsonb
language sql stable
as $$
  select jsonb_build_object(
    'id', p.id, 'name', p.name, 'username', p.username, 'email', u.email, 'timezone', p.timezone,
    'settings', app_private.default_settings() || p.settings)
  from public.profiles p join auth.users u on u.id = p.id
  where p.id = p_user
$$;

-- -----------------------------------------------------------------------------
-- 5. RPC set_username(p_username text) returns get_me() shape
-- -----------------------------------------------------------------------------
create or replace function public.set_username(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := app_private.require_uid();
  v_name  text := lower(btrim(coalesce(p_username, '')));
begin
  if v_name !~ '^[a-z][a-z0-9_]{2,19}$' then
    raise exception 'Username must be 3-20 characters, lowercase letters, numbers or underscores, starting with a letter'
      using errcode = '22023';
  end if;

  if v_name in ('admin', 'support', 'zikr', 'namaz', 'moderator', 'system') then
    raise exception 'That username is reserved' using errcode = '22023';
  end if;

  if exists (select 1 from public.profiles where lower(username) = v_name and id <> v_uid) then
    raise exception 'That username is taken' using errcode = '23505';
  end if;

  update public.profiles
     set username = v_name
   where id = v_uid;

  return app_private.user_json(v_uid);
end;
$$;

-- -----------------------------------------------------------------------------
-- Update update_settings to support showOnGlobal and check username
-- -----------------------------------------------------------------------------
create or replace function public.update_settings(patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := app_private.require_uid();
  k       text;
  v       jsonb;
  v_clean jsonb := '{}'::jsonb;
  v_name  text;
  v_tz    text;
  v_user  public.profiles%rowtype;
begin
  if patch is null or jsonb_typeof(patch) <> 'object' then
    raise exception 'Settings patch must be an object' using errcode = '22023';
  end if;

  select * into v_user from public.profiles where id = v_uid;

  for k, v in select * from jsonb_each(patch) loop
    if k = 'name' then
      if jsonb_typeof(v) <> 'string' or char_length(btrim(v #>> '{}')) not between 1 and 60 then
        raise exception 'Name must be 1 to 60 characters' using errcode = '22023';
      end if;
      v_name := btrim(v #>> '{}');
    elsif k = 'timezone' then
      if jsonb_typeof(v) <> 'string' or not app_private.is_valid_timezone(v #>> '{}') then
        raise exception 'Unknown timezone' using errcode = '22023';
      end if;
      v_tz := v #>> '{}';
    elsif k in ('city','country') then
      if jsonb_typeof(v) <> 'string' or char_length(btrim(v #>> '{}')) not between 1 and 80 then
        raise exception '% must be 1 to 80 characters', k using errcode = '22023';
      end if;
      v_clean := v_clean || jsonb_build_object(k, btrim(v #>> '{}'));
    elsif k = 'method' then
      if jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric not in (1,2,3,4,5) then
        raise exception 'Method must be 1 to 5' using errcode = '22023';
      end if;
      v_clean := v_clean || jsonb_build_object(k, (v #>> '{}')::int);
    elsif k = 'asr' then
      if jsonb_typeof(v) <> 'string' or (v #>> '{}') not in ('standard','hanafi') then
        raise exception 'Asr must be standard or hanafi' using errcode = '22023';
      end if;
      v_clean := v_clean || jsonb_build_object(k, v);
    elsif k = 'smartFixChoice' then
      if not (jsonb_typeof(v) = 'null' or (jsonb_typeof(v) = 'string' and (v #>> '{}') in ('alarm','buddy'))) then
        raise exception 'smartFixChoice must be alarm, buddy or null' using errcode = '22023';
      end if;
      v_clean := v_clean || jsonb_build_object(k, v);
    elsif k in ('azanAlert','jamaatNudge','azkarReminder','smartFix','shareStats',
                'shareHeatmap','shareQuran','weeklyReport','showHadith','showOnGlobal') then
      if jsonb_typeof(v) <> 'boolean' then
        raise exception '% must be true or false', k using errcode = '22023';
      end if;
      if k = 'showOnGlobal' and (v #>> '{}')::boolean and v_user.username is null then
        raise exception 'Choose a username first' using errcode = '22023';
      end if;
      v_clean := v_clean || jsonb_build_object(k, v);
    else
      raise exception 'Unknown setting: %', k using errcode = '22023';
    end if;
  end loop;

  update public.profiles
     set settings = app_private.default_settings() || settings || v_clean,
         name     = coalesce(v_name, name),
         timezone = coalesce(v_tz, timezone)
   where id = v_uid;

  return app_private.user_json(v_uid);
end;
$$;

-- -----------------------------------------------------------------------------
-- 6 & 7. RPC get_global_leaderboard(p_period text)
-- Active = has any prayer_logs row in the last 7 days of their own user_today().
-- -----------------------------------------------------------------------------
create or replace function app_private.is_user_active(p_user uuid)
returns boolean
language sql stable
as $$
  select exists (
    select 1 from public.prayer_logs
    where user_id = p_user
      and log_date between (app_private.user_today(p_user) - 6) and app_private.user_today(p_user)
  )
$$;

create or replace function public.get_global_leaderboard(p_period text default 'week')
returns jsonb
language plpgsql stable
security definer
set search_path = public
as $$
declare
  v_uid      uuid := app_private.require_uid();
  v_from     date;
  v_to       date;
  v_opted_in boolean;
  v_my_user  text;
  v_rows     jsonb;
  v_my_rank  int;
  v_my_pts   int;
begin
  select b.from_d, b.to_d into v_from, v_to from app_private.period_bounds(v_uid, p_period) b;

  select username, app_private.setting_bool(settings, 'showOnGlobal') and username is not null
    into v_my_user, v_opted_in
    from public.profiles where id = v_uid;

  -- Compute points and ranks for all opted-in active users
  with candidates as (
    select p.id,
           p.username,
           app_private.points_between(p.id, v_from, v_to) as points,
           (select s.cur from app_private.namaz_streak(p.id) s) as streak,
           (p.id = v_uid) as is_me,
           app_private.are_friends(v_uid, p.id) as is_friend,
           exists (
             select 1 from public.friend_requests fr
             join auth.users tu on lower(tu.email) = fr.email
             where fr.requester = v_uid and tu.id = p.id
           ) as requested
    from public.profiles p
    where p.username is not null
      and app_private.setting_bool(p.settings, 'showOnGlobal')
      and app_private.is_user_active(p.id)
  ),
  ranked as (
    select c.*,
           dense_rank() over (order by c.points desc) as rank
    from candidates c
  )
  select
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'username', r.username,
          'points', r.points,
          'streak', r.streak,
          'isMe', r.is_me,
          'isFriend', r.is_friend,
          'requested', r.requested
        )
        order by r.points desc, r.username asc
      )
      from (
        select * from ranked
        order by points desc, username asc
        limit 50
      ) r
    ), '[]'::jsonb),
    (select rank from ranked where is_me),
    (select points from ranked where is_me)
  into v_rows, v_my_rank, v_my_pts;

  if v_my_pts is null then
    v_my_pts := app_private.points_between(v_uid, v_from, v_to);
  end if;

  return jsonb_build_object(
    'rows', v_rows,
    'me', jsonb_build_object(
      'rank', v_my_rank,
      'points', coalesce(v_my_pts, 0),
      'optedIn', coalesce(v_opted_in, false),
      'username', v_my_user
    )
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. RPC send_friend_request_to_user(p_user_id uuid) returns jsonb {ok, message}
-- -----------------------------------------------------------------------------
create or replace function public.send_friend_request_to_user(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := app_private.require_uid();
  v_sender  public.profiles%rowtype;
  v_target  public.profiles%rowtype;
  v_temail  text;
  v_memail  text;
  v_generic jsonb := jsonb_build_object('ok', true,
                     'message', 'If that person has an account, they will get your request.');
begin
  if p_user_id is null or p_user_id = v_uid then
    raise exception 'Invalid target user' using errcode = '22023';
  end if;

  select * into v_sender from public.profiles where id = v_uid;
  if v_sender.username is null then
    raise exception 'Choose a username first' using errcode = '22023';
  end if;

  select * into v_target from public.profiles where id = p_user_id;
  if not found or v_target.username is null or not app_private.setting_bool(v_target.settings, 'showOnGlobal') then
    raise exception 'This person is not on the global leaderboard' using errcode = '22023';
  end if;

  -- Not already friends (return generic ok)
  if app_private.are_friends(v_uid, p_user_id) then
    return v_generic;
  end if;

  -- Not blocked BY the target (return same generic ok so blocking is invisible)
  if app_private.is_blocked_by(v_uid, p_user_id) then
    return v_generic;
  end if;

  select lower(email) into v_memail from auth.users where id = v_uid;
  select lower(email) into v_temail from auth.users where id = p_user_id;

  -- If target already sent ME a request, accept it (create friendship)
  if exists (select 1 from public.friend_requests where requester = p_user_id and email = v_memail) then
    insert into public.friendships (requester, addressee) values (p_user_id, v_uid)
    on conflict do nothing;
    delete from public.friend_requests
     where (requester = p_user_id and email = v_memail) or (requester = v_uid and email = v_temail);
    return jsonb_build_object('ok', true, 'message', 'You are now friends.');
  end if;

  -- 100-pending cap
  if (select count(*) from public.friend_requests where requester = v_uid) >= 100 then
    raise exception 'Too many pending requests' using errcode = '22023';
  end if;

  insert into public.friend_requests (requester, email, via)
  values (v_uid, v_temail, 'global')
  on conflict (requester, email) do nothing;

  return v_generic;
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. Change list_friend_requests:
-- via = 'global' -> { id, name: requester's username, email: null, via: 'global' }
-- email-based -> { id, name, email, via: 'email' }
-- exclude requests from users I have blocked.
-- -----------------------------------------------------------------------------
create or replace function public.list_friend_requests()
returns jsonb
language plpgsql stable
security definer
set search_path = public
as $$
declare
  v_uid  uuid := app_private.require_uid();
  v_mine text;
begin
  select lower(email) into v_mine from auth.users where id = v_uid;
  return jsonb_build_object(
    'incoming', coalesce((
      select jsonb_agg(
        case when r.via = 'global' then
          jsonb_build_object('id', r.id, 'name', p.username, 'email', null, 'via', 'global')
        else
          jsonb_build_object('id', r.id, 'name', p.name, 'email', u.email, 'via', 'email')
        end
        order by r.created_at desc
      )
      from public.friend_requests r
      join public.profiles p on p.id = r.requester
      join auth.users u on u.id = r.requester
      where r.email = v_mine
        and not app_private.are_friends(v_uid, r.requester)
        and not app_private.is_blocked_by(r.requester, v_uid)
    ), '[]'::jsonb),
    'outgoing', coalesce((
      select jsonb_agg(
        case when r.via = 'global' then
          jsonb_build_object('id', r.id, 'username', tp.username, 'email', null, 'via', 'global')
        else
          jsonb_build_object('id', r.id, 'email', r.email::text, 'via', 'email')
        end
        order by r.created_at desc
      )
      from public.friend_requests r
      left join auth.users tu on lower(tu.email) = r.email
      left join public.profiles tp on tp.id = tu.id
      where r.requester = v_uid
    ), '[]'::jsonb)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 10. RPCs block_user, unblock_user, list_blocked
-- block deletes pending requests in both directions between the two users.
-- -----------------------------------------------------------------------------
create or replace function public.block_user(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := app_private.require_uid();
  v_memail text;
  v_temail text;
begin
  if p_user_id is null or p_user_id = v_uid then
    raise exception 'Invalid user to block' using errcode = '22023';
  end if;

  insert into public.friend_blocks (blocker, blocked)
  values (v_uid, p_user_id)
  on conflict (blocker, blocked) do nothing;

  select lower(email) into v_memail from auth.users where id = v_uid;
  select lower(email) into v_temail from auth.users where id = p_user_id;

  -- Delete pending requests in both directions
  if v_memail is not null and v_temail is not null then
    delete from public.friend_requests
    where (requester = v_uid and email = v_temail)
       or (requester = p_user_id and email = v_memail);
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.unblock_user(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := app_private.require_uid();
begin
  delete from public.friend_blocks
   where blocker = v_uid and blocked = p_user_id;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.list_blocked()
returns jsonb
language plpgsql stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := app_private.require_uid();
begin
  return coalesce((
    select jsonb_agg(
      jsonb_build_object('id', p.id, 'username', coalesce(p.username, p.name))
      order by b.created_at desc
    )
    from public.friend_blocks b
    join public.profiles p on p.id = b.blocked
    where b.blocker = v_uid
  ), '[]'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------
-- 11. Update export_my_data to include username and blocked list
-- -----------------------------------------------------------------------------
create or replace function public.export_my_data()
returns jsonb
language plpgsql stable
security definer
set search_path = public
as $$
declare v_uid uuid := app_private.require_uid();
begin
  return jsonb_build_object(
    'exportedAt', app_private.now(),
    'user', app_private.user_json(v_uid),
    'prayerLogs', coalesce((select jsonb_agg(to_jsonb(t) - 'user_id' order by log_date, prayer)
                            from public.prayer_logs t where user_id = v_uid), '[]'),
    'zikrLogs',   coalesce((select jsonb_agg(to_jsonb(t) - 'user_id' order by log_date, slot)
                            from public.zikr_logs t where user_id = v_uid), '[]'),
    'quranLogs',  coalesce((select jsonb_agg(to_jsonb(t) - 'user_id' order by log_date)
                            from public.quran_logs t where user_id = v_uid), '[]'),
    'naflLogs',   coalesce((select jsonb_agg(to_jsonb(t) - 'user_id' order by log_date, name)
                            from public.nafl_logs t where user_id = v_uid), '[]'),
    'friends',    coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'username', p.username))
                            from public.profiles p where p.id in (select app_private.friend_ids(v_uid))), '[]'),
    'friendRequestsSent', coalesce((
      select jsonb_agg(
        case when r.via = 'global' then
          jsonb_build_object('username', tp.username, 'via', 'global', 'createdAt', r.created_at)
        else
          jsonb_build_object('email', r.email::text, 'via', 'email', 'createdAt', r.created_at)
        end
        order by r.created_at desc
      )
      from public.friend_requests r
      left join auth.users tu on lower(tu.email) = r.email
      left join public.profiles tp on tp.id = tu.id
      where r.requester = v_uid
    ), '[]'::jsonb),
    'blocked', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username))
                         from public.friend_blocks b
                         join public.profiles p on p.id = b.blocked
                         where b.blocker = v_uid), '[]'),
    'challenges', coalesce((select jsonb_agg(app_private.challenge_json(c, v_uid))
                            from public.challenges c
                            where c.owner_id = v_uid or exists (
                              select 1 from public.challenge_members m
                              where m.challenge_id = c.id and m.user_id = v_uid)), '[]'),
    'challengeRewards', coalesce((select jsonb_agg(to_jsonb(t) - 'user_id')
                            from public.challenge_rewards t where user_id = v_uid), '[]'),
    'badges', app_private.badges_json(v_uid)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 12. Grants on new public RPCs & permission hardening
-- -----------------------------------------------------------------------------
grant execute on function
  public.set_username(text),
  public.get_global_leaderboard(text),
  public.send_friend_request_to_user(uuid),
  public.block_user(uuid),
  public.unblock_user(uuid),
  public.list_blocked()
to authenticated;

revoke execute on function app_private.is_blocked_by(uuid, uuid), app_private.is_user_active(uuid)
  from public, anon, authenticated;
revoke execute on function public.set_username(text), public.get_global_leaderboard(text),
  public.send_friend_request_to_user(uuid), public.block_user(uuid), public.unblock_user(uuid),
  public.list_blocked() from public, anon;

