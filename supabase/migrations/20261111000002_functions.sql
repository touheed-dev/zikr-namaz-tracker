-- =============================================================================
-- Zikr & Namaz Tracker: business rules (all writes go through these)
-- Every public function is SECURITY DEFINER with search_path = public, uses
-- auth.uid() and validates every argument. Helpers live in app_private,
-- which PostgREST does not expose and clients cannot execute.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Private helpers
-- -----------------------------------------------------------------------------
create or replace function app_private.require_uid()
returns uuid
language plpgsql stable
as $$
declare v uuid := auth.uid();
begin
  if v is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v) then
    raise exception 'Profile not found' using errcode = '28000';
  end if;
  return v;
end;
$$;

-- "Today" for a user = server clock in the user's own timezone.
create or replace function app_private.user_today(p_user uuid)
returns date
language sql stable
as $$
  select (app_private.now() at time zone coalesce(
            (select timezone from public.profiles where id = p_user), 'Asia/Kolkata'))::date
$$;

create or replace function app_private.check_log_date(p_user uuid, p_date date)
returns date  -- returns the user's today
language plpgsql stable
as $$
declare v_today date := app_private.user_today(p_user);
begin
  if p_date is null then
    raise exception 'Date is required' using errcode = '22023';
  end if;
  if p_date > v_today then
    raise exception 'Future dates cannot be logged' using errcode = '22023';
  end if;
  if p_date < v_today - 3650 then
    raise exception 'Date is too far in the past' using errcode = '22023';
  end if;
  return v_today;
end;
$$;

-- Gaps-and-islands over a set of dates. p_step = 1 for daily, 7 for weekly
-- (e.g. consecutive Fridays). "cur" forgives the current period: it counts the
-- island ending today, or ending one step before today.
create or replace function app_private.streak_stats(p_dates date[], p_today date, p_step int default 1)
returns table (cur int, best int)
language sql immutable
as $$
  with d as (
    select distinct x as day from unnest(coalesce(p_dates, '{}'::date[])) x where x <= p_today
  ), g as (
    select day, day - (row_number() over (order by day))::int * p_step as grp from d
  ), islands as (
    select max(day) as e, count(*)::int as n from g group by grp
  )
  select
    coalesce((select n from islands where e >= p_today - p_step order by e desc limit 1), 0),
    coalesce((select max(n) from islands), 0)
$$;

-- Complete day = all 5 prayers jamaat/alone/qaza (records, edited or not:
-- the streak shows the truth even for days that earned no points).
create or replace function app_private.complete_dates(p_user uuid)
returns date[]
language sql stable
as $$
  select coalesce(array_agg(log_date order by log_date), '{}')
  from (
    select log_date from public.prayer_logs
    where user_id = p_user and status in ('jamaat','alone','qaza')
    group by log_date having count(*) = 5
  ) t
$$;

create or replace function app_private.namaz_streak(p_user uuid)
returns table (cur int, best int)
language sql stable
as $$ select * from app_private.streak_stats(app_private.complete_dates(p_user), app_private.user_today(p_user), 1) $$;

create or replace function app_private.quran_streak(p_user uuid)
returns table (cur int, best int)
language sql stable
as $$
  select * from app_private.streak_stats(
    (select coalesce(array_agg(log_date), '{}') from public.quran_logs where user_id = p_user and pages > 0),
    app_private.user_today(p_user), 1)
$$;

create or replace function app_private.nafl_streak(p_user uuid)
returns table (cur int, best int)
language sql stable
as $$
  select * from app_private.streak_stats(
    (select coalesce(array_agg(distinct log_date), '{}') from public.nafl_logs
      where user_id = p_user and done and name not like 'ramadan:%'),
    app_private.user_today(p_user), 1)
$$;

-- Leaderboard points for one user over a date range. Only eligible, non-edited
-- rows count; bonuses are derived from the same rows.
create or replace function app_private.points_between(p_user uuid, p_from date, p_to date)
returns int
language sql stable
as $$
  select (
    coalesce((select sum(points) from public.prayer_logs
              where user_id = p_user and log_date between p_from and p_to
                and eligible and not edited), 0)
    + 5 * (select count(*) from (
             select log_date from public.prayer_logs
             where user_id = p_user and log_date between p_from and p_to
               and eligible and not edited and points > 0
               and status in ('jamaat','alone','qaza')
             group by log_date having count(*) = 5) full_days)
    + 3 * (select count(*) from (
             select log_date from public.zikr_logs
             where user_id = p_user and log_date between p_from and p_to
               and done and eligible and not edited
             group by log_date having count(*) = 2) both_azkar)
    + coalesce((select sum(points) from public.challenge_rewards
                where user_id = p_user and granted_on between p_from and p_to), 0)
  )::int
$$;

-- Period bounds in the VIEWER's timezone. Week = Monday..Sunday.
create or replace function app_private.period_bounds(p_user uuid, p_period text)
returns table (from_d date, to_d date)
language plpgsql stable
as $$
declare v_today date := app_private.user_today(p_user);
begin
  if p_period = 'week' then
    from_d := v_today - (extract(isodow from v_today)::int - 1);
    to_d := from_d + 6;
  elsif p_period = 'month' then
    from_d := date_trunc('month', v_today)::date;
    to_d := (date_trunc('month', v_today) + interval '1 month - 1 day')::date;
  elsif p_period = 'all' then
    from_d := date '2000-01-01';
    to_d := date '2999-12-31';
  else
    raise exception 'Unknown period' using errcode = '22023';
  end if;
  return next;
end;
$$;

create or replace function app_private.are_friends(a uuid, b uuid)
returns boolean
language sql stable
as $$
  select a is not null and b is not null and a <> b and exists (
    select 1 from public.friendships
    where least(requester, addressee) = least(a, b)
      and greatest(requester, addressee) = greatest(a, b))
$$;

create or replace function app_private.friend_ids(p_user uuid)
returns setof uuid
language sql stable
as $$
  select case when requester = p_user then addressee else requester end
  from public.friendships where p_user in (requester, addressee)
$$;

create or replace function app_private.setting_bool(p_settings jsonb, p_key text)
returns boolean
language sql immutable
as $$
  select case when jsonb_typeof(p_settings -> p_key) = 'boolean'
              then (p_settings ->> p_key)::boolean
              else (app_private.default_settings() ->> p_key)::boolean end
$$;

create or replace function app_private.user_json(p_user uuid)
returns jsonb
language sql stable
as $$
  select jsonb_build_object(
    'id', p.id, 'name', p.name, 'email', u.email, 'timezone', p.timezone,
    'settings', app_private.default_settings() || p.settings)
  from public.profiles p join auth.users u on u.id = p.id
  where p.id = p_user
$$;

-- -----------------------------------------------------------------------------
-- Challenges: which days count for a user (computed from logs only)
-- p_strict = only eligible, non-edited rows (used for reward-bearing friend
-- challenges so late fills and edits cannot earn rewards).
-- -----------------------------------------------------------------------------
create or replace function app_private.challenge_days(p_user uuid, c public.challenges, p_strict boolean)
returns setof date
language sql stable
as $$
  with lim as (select app_private.user_today(p_user) as to_d)
  select d from (
    select l.log_date as d from public.prayer_logs l, lim
    where c.kind = 'namaz' and l.user_id = p_user
      and l.log_date between c.starts_on and lim.to_d
      and l.status in ('jamaat','alone')
      and (not p_strict or (l.eligible and not l.edited))
    group by l.log_date having count(*) = 5
    union
    select l.log_date from public.prayer_logs l, lim
    where c.kind = 'jamaat' and l.user_id = p_user
      and l.log_date between c.starts_on and lim.to_d
      and l.status = 'jamaat' and (c.prayer is null or l.prayer = c.prayer)
      and (not p_strict or (l.eligible and not l.edited))
    group by l.log_date having count(*) = case when c.prayer is null then 5 else 1 end
    union
    select z.log_date from public.zikr_logs z, lim
    where c.kind = 'zikr' and z.user_id = p_user
      and z.log_date between c.starts_on and lim.to_d
      and z.done and (c.slot = 'both' or z.slot = c.slot)
      and (not p_strict or (z.eligible and not z.edited))
    group by z.log_date having count(*) = case when c.slot = 'both' then 2 else 1 end
    union
    select q.log_date from public.quran_logs q, lim
    where c.kind = 'quran' and q.user_id = p_user
      and q.log_date between c.starts_on and lim.to_d
      and q.pages >= coalesce(c.pages, 1)
  ) days
  where c.weekdays is null or extract(isodow from d)::int = any (c.weekdays)
$$;

-- Days that count for the challenge as a whole. Personal: the owner's days.
-- Friend: days on which EVERY accepted member qualified ("together").
create or replace function app_private.challenge_group_days(c public.challenges)
returns setof date
language sql stable
as $$
  with m as (
    select user_id from public.challenge_members
    where challenge_id = c.id and status = 'accepted'
    union select c.owner_id
  ), n as (select count(*) as cnt from m)
  select d from (
    select app_private.challenge_days(m.user_id, c, c.type = 'friend') as d, m.user_id from m
  ) x
  group by d
  having count(distinct user_id) = (select cnt from n)
$$;

create or replace function app_private.challenge_progress(c public.challenges)
returns int
language sql stable
as $$
  select least(c.target, (select count(*)::int from app_private.challenge_group_days(c)))
$$;

-- Grant friend-challenge rewards once, to every accepted member.
create or replace function app_private.check_challenges(p_user uuid)
returns void
language plpgsql
as $$
declare c public.challenges;
begin
  for c in
    select ch.* from public.challenges ch
    where ch.type = 'friend' and not ch.reward_granted
      and (ch.owner_id = p_user or exists (
            select 1 from public.challenge_members cm
            where cm.challenge_id = ch.id and cm.user_id = p_user and cm.status = 'accepted'))
    for update of ch skip locked
  loop
    if app_private.challenge_progress(c) >= c.target then
      insert into public.challenge_rewards (challenge_id, user_id, points, granted_on)
      select c.id, m.user_id, c.reward, app_private.user_today(m.user_id)
      from (select user_id from public.challenge_members
            where challenge_id = c.id and status = 'accepted'
            union select c.owner_id) m
      on conflict do nothing;
      update public.challenges set reward_granted = true where id = c.id;
    end if;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Logging RPCs
-- -----------------------------------------------------------------------------
create or replace function public.set_prayer(p_date date, p_prayer text, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := app_private.require_uid();
  v_today date;
  v_elig  boolean;
  r       public.prayer_logs;
  v_pts   int;
begin
  if p_prayer is null or p_prayer not in ('fajr','dhuhr','asr','maghrib','isha') then
    raise exception 'Unknown prayer' using errcode = '22023';
  end if;
  if p_status is not null and p_status not in ('jamaat','alone','qaza','missed') then
    raise exception 'Unknown status' using errcode = '22023';
  end if;
  v_today := app_private.check_log_date(v_uid, p_date);
  v_elig  := p_date >= v_today - 2;

  -- serialise concurrent taps on the same cell
  perform pg_advisory_xact_lock(hashtext(v_uid::text || p_date::text || p_prayer));

  select * into r from public.prayer_logs
  where user_id = v_uid and log_date = p_date and prayer = p_prayer
  for update;

  if not found then
    if p_status is null then
      return jsonb_build_object('date', p_date, 'prayer', p_prayer, 'status', null,
                                'points', 0, 'edited', false);
    end if;
    v_pts := case when not v_elig then 0
                  when p_status = 'jamaat' then 10
                  when p_status = 'alone'  then 4
                  when p_status = 'qaza'   then 2
                  else 0 end;
    insert into public.prayer_logs (user_id, log_date, prayer, status, eligible, edited, points, qaza_at)
    values (v_uid, p_date, p_prayer, p_status, v_elig, false, v_pts,
            case when p_status = 'qaza' then app_private.now() end)
    returning * into r;

  elsif r.status is not distinct from p_status then
    null;  -- idempotent repeat (double click): not an edit

  elsif p_status = 'qaza' and r.status = 'missed' and not r.edited and r.qaza_at is null then
    -- the one allowed non-edit transition: missed -> qaza made up (+2 once)
    update public.prayer_logs
       set status = 'qaza', qaza_at = app_private.now(),
           points = case when v_elig and r.eligible then 2 else 0 end,
           updated_at = app_private.now()
     where user_id = v_uid and log_date = p_date and prayer = p_prayer
    returning * into r;

  else
    -- any other change (including clear) is an edit: 0 points forever
    update public.prayer_logs
       set status = p_status, edited = true, points = 0, updated_at = app_private.now()
     where user_id = v_uid and log_date = p_date and prayer = p_prayer
    returning * into r;
  end if;

  perform app_private.check_challenges(v_uid);

  return jsonb_build_object('date', r.log_date, 'prayer', r.prayer, 'status', r.status,
                            'points', r.points, 'edited', r.edited);
end;
$$;

create or replace function public.set_zikr(p_date date, p_slot text, p_done boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := app_private.require_uid();
  v_today date;
  r       public.zikr_logs;
begin
  if p_slot is null or p_slot not in ('morning','evening') then
    raise exception 'Unknown azkar slot' using errcode = '22023';
  end if;
  if p_done is null then
    raise exception 'done is required' using errcode = '22023';
  end if;
  v_today := app_private.check_log_date(v_uid, p_date);
  perform pg_advisory_xact_lock(hashtext(v_uid::text || p_date::text || p_slot));

  select * into r from public.zikr_logs
  where user_id = v_uid and log_date = p_date and slot = p_slot for update;

  if not found then
    if not p_done then
      return jsonb_build_object('date', p_date, 'slot', p_slot, 'done', false);
    end if;
    insert into public.zikr_logs (user_id, log_date, slot, done, eligible, edited)
    values (v_uid, p_date, p_slot, true, p_date >= v_today - 2, false)
    returning * into r;
  elsif r.done is distinct from p_done then
    update public.zikr_logs set done = p_done, edited = true, updated_at = app_private.now()
    where user_id = v_uid and log_date = p_date and slot = p_slot
    returning * into r;
  end if;

  perform app_private.check_challenges(v_uid);
  return jsonb_build_object('date', r.log_date, 'slot', r.slot, 'done', r.done);
end;
$$;

create or replace function public.set_quran(p_date date, p_pages int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := app_private.require_uid();
  r     public.quran_logs;
begin
  if p_pages is null or p_pages < 0 or p_pages > 604 then
    raise exception 'Pages must be between 0 and 604' using errcode = '22023';
  end if;
  perform app_private.check_log_date(v_uid, p_date);
  insert into public.quran_logs (user_id, log_date, pages)
  values (v_uid, p_date, p_pages)
  on conflict (user_id, log_date)
  do update set pages = excluded.pages, updated_at = app_private.now()
  returning * into r;
  perform app_private.check_challenges(v_uid);
  return jsonb_build_object('date', r.log_date, 'pages', r.pages);
end;
$$;

create or replace function public.set_nafl(p_date date, p_name text, p_done boolean, p_value int default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := app_private.require_uid();
  v_done boolean := coalesce(p_done, false);
  v_val  int := null;
  r      public.nafl_logs;
begin
  if p_name is null or p_name !~ '^(duha|tahajjud|witr|sunnah|ishraq|ramadan:(roza|sehri|iftar|sadaqah|taraweeh))$' then
    raise exception 'Unknown item' using errcode = '22023';
  end if;
  if p_name = 'ramadan:taraweeh' then
    if p_value is null or p_value < 0 or p_value > 20 then
      raise exception 'Taraweeh rakats must be between 0 and 20' using errcode = '22023';
    end if;
    v_val := p_value;
    v_done := p_value > 0;
  elsif p_value is not null then
    raise exception 'Only taraweeh takes a value' using errcode = '22023';
  end if;
  perform app_private.check_log_date(v_uid, p_date);
  insert into public.nafl_logs (user_id, log_date, name, done, value)
  values (v_uid, p_date, p_name, v_done, v_val)
  on conflict (user_id, log_date, name)
  do update set done = excluded.done, value = excluded.value, updated_at = app_private.now()
  returning * into r;
  return jsonb_build_object('date', r.log_date, 'name', r.name, 'done', r.done, 'value', r.value);
end;
$$;

create or replace function public.get_quran_total()
returns int
language sql stable
security definer
set search_path = public
as $$
  select coalesce(sum(pages), 0)::int from public.quran_logs where user_id = auth.uid()
$$;

-- -----------------------------------------------------------------------------
-- Settings
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
begin
  if patch is null or jsonb_typeof(patch) <> 'object' then
    raise exception 'Settings patch must be an object' using errcode = '22023';
  end if;

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
                'shareHeatmap','shareQuran','weeklyReport','showHadith') then
      if jsonb_typeof(v) <> 'boolean' then
        raise exception '% must be true or false', k using errcode = '22023';
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

create or replace function public.get_me()
returns jsonb
language sql stable
security definer
set search_path = public
as $$ select app_private.user_json(app_private.require_uid()) $$;

-- -----------------------------------------------------------------------------
-- Leaderboard and summary
-- -----------------------------------------------------------------------------
create or replace function public.get_leaderboard(p_period text default 'week')
returns table (id uuid, name text, points int, streak int, is_me boolean)
language plpgsql stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid  uuid := app_private.require_uid();
  v_from date;
  v_to   date;
begin
  select b.from_d, b.to_d into v_from, v_to from app_private.period_bounds(v_uid, p_period) b;
  return query
  select p.id, p.name,
         app_private.points_between(p.id, v_from, v_to),
         (select s.cur from app_private.namaz_streak(p.id) s),
         p.id = v_uid
  from public.profiles p
  where p.id = v_uid
     or (p.id in (select app_private.friend_ids(v_uid))
         and app_private.setting_bool(p.settings, 'shareStats'))
  order by 3 desc, (p.id = v_uid) desc, p.name;
end;
$$;

create or replace function public.get_profile_summary()
returns jsonb
language plpgsql stable
security definer
set search_path = public
as $$
declare
  v_uid    uuid := app_private.require_uid();
  v_today  date := app_private.user_today(v_uid);
  v_week   int;
  v_total  int;
  v_rank   int;
  n        record;
  q        record;
  f        record;
  v_jp     int;
begin
  select * into n from app_private.namaz_streak(v_uid);
  select * into q from app_private.quran_streak(v_uid);
  select * into f from app_private.nafl_streak(v_uid);
  select b.points into v_week from public.get_leaderboard('week') b where b.is_me;
  select r.rk into v_rank from (
    select b.is_me, rank() over (order by b.points desc) as rk from public.get_leaderboard('week') b
  ) r where r.is_me;
  v_total := app_private.points_between(v_uid, date '2000-01-01', date '2999-12-31');
  select case when count(*) = 0 then null
              else round(100.0 * count(*) filter (where status = 'jamaat') / count(*))::int end
    into v_jp
    from public.prayer_logs
   where user_id = v_uid and status is not null and log_date between v_today - 29 and v_today;

  return jsonb_build_object(
    'points', coalesce(v_week, 0), 'totalPoints', v_total, 'weekRank', v_rank,
    'streak', n.cur, 'bestStreak', n.best, 'jamaatPct', v_jp,
    'quranStreak', q.cur, 'quranBest', q.best, 'naflStreak', f.cur,
    'today', v_today);
end;
$$;

-- -----------------------------------------------------------------------------
-- Friends
-- -----------------------------------------------------------------------------
create or replace function public.send_friend_request(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := app_private.require_uid();
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_mine    text;
  v_target  uuid;
  v_generic jsonb := jsonb_build_object('ok', true,
                     'message', 'If that person has an account, they will get your request.');
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    raise exception 'Enter a valid email address' using errcode = '22023';
  end if;
  select lower(email) into v_mine from auth.users where id = v_uid;
  if v_email = v_mine then
    raise exception 'You cannot invite yourself' using errcode = '22023';
  end if;

  select id into v_target from auth.users where lower(email) = v_email;

  if v_target is not null and app_private.are_friends(v_uid, v_target) then
    return v_generic;  -- already friends: ignore silently
  end if;

  -- they already invited me: inviting them back simply accepts
  if v_target is not null and exists (
       select 1 from public.friend_requests where requester = v_target and email = v_mine) then
    insert into public.friendships (requester, addressee) values (v_target, v_uid)
    on conflict do nothing;
    delete from public.friend_requests
     where (requester = v_target and email = v_mine) or (requester = v_uid and email = v_email);
    return jsonb_build_object('ok', true, 'message', 'You are now friends.');
  end if;

  if (select count(*) from public.friend_requests where requester = v_uid) >= 100 then
    raise exception 'Too many pending requests' using errcode = '22023';
  end if;

  insert into public.friend_requests (requester, email) values (v_uid, v_email)
  on conflict (requester, email) do nothing;  -- duplicates ignored
  return v_generic;
end;
$$;

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
      select jsonb_agg(jsonb_build_object('id', r.id, 'name', p.name, 'email', u.email) order by r.created_at desc)
      from public.friend_requests r
      join public.profiles p on p.id = r.requester
      join auth.users u on u.id = r.requester
      where r.email = v_mine and not app_private.are_friends(v_uid, r.requester)), '[]'::jsonb),
    'outgoing', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'email', r.email::text) order by r.created_at desc)
      from public.friend_requests r where r.requester = v_uid), '[]'::jsonb));
end;
$$;

create or replace function public.accept_friend_request(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := app_private.require_uid();
  v_mine text;
  v_from uuid;
  v_from_email text;
begin
  select lower(email) into v_mine from auth.users where id = v_uid;
  select requester into v_from from public.friend_requests where id = p_id and email = v_mine;
  if v_from is null then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  select lower(email) into v_from_email from auth.users where id = v_from;
  insert into public.friendships (requester, addressee) values (v_from, v_uid) on conflict do nothing;
  delete from public.friend_requests
   where (requester = v_from and email = v_mine) or (requester = v_uid and email = v_from_email);
  return jsonb_build_object('ok', true);
end;
$$;

-- Removes a friend (p_id = friend's user id), or declines an incoming /
-- cancels an outgoing request (p_id = request id).
create or replace function public.remove_friend(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := app_private.require_uid();
  v_mine text;
  v_n    int;
begin
  select lower(email) into v_mine from auth.users where id = v_uid;
  delete from public.friend_requests where id = p_id and (requester = v_uid or email = v_mine);
  get diagnostics v_n = row_count;
  if v_n = 0 then
    delete from public.friendships
     where least(requester, addressee) = least(v_uid, p_id)
       and greatest(requester, addressee) = greatest(v_uid, p_id);
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Friend views: data only if friends AND the owner turned the share on.
create or replace function public.friend_heatmap(p_friend_id uuid, p_days int default 21)
returns jsonb
language plpgsql stable
security definer
set search_path = public
as $$
declare
  v_uid   uuid := app_private.require_uid();
  v_days  int := least(greatest(coalesce(p_days, 21), 1), 90);
  v_today date;
begin
  if not app_private.are_friends(v_uid, p_friend_id)
     or not (select app_private.setting_bool(settings, 'shareHeatmap') from public.profiles where id = p_friend_id) then
    return null;
  end if;
  v_today := app_private.user_today(p_friend_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object('date', log_date, 'prayer', prayer, 'status', status)
                     order by log_date, prayer)
    from public.prayer_logs
    where user_id = p_friend_id and status is not null
      and log_date between v_today - (v_days - 1) and v_today), '[]'::jsonb);
end;
$$;

create or replace function public.friend_quran_streak(p_friend_id uuid)
returns int
language plpgsql stable
security definer
set search_path = public
as $$
declare v_uid uuid := app_private.require_uid();
begin
  if not app_private.are_friends(v_uid, p_friend_id)
     or not (select app_private.setting_bool(settings, 'shareQuran') from public.profiles where id = p_friend_id) then
    return null;
  end if;
  return (select cur from app_private.quran_streak(p_friend_id));
end;
$$;

-- -----------------------------------------------------------------------------
-- Badges (computed, never stored)
-- -----------------------------------------------------------------------------
create or replace function app_private.badge_progress(p_user uuid)
returns table (code text, progress int)
language plpgsql stable
as $$
declare
  v_today date := app_private.user_today(p_user);
  v_best  int;
begin
  select best into v_best from app_private.namaz_streak(p_user);
  code := 'first_week'; progress := v_best; return next;
  code := 'streak_30';  progress := v_best; return next;

  code := 'jumuah_jamaat';
  select s.best into progress from app_private.streak_stats(
    (select coalesce(array_agg(log_date), '{}') from public.prayer_logs
      where user_id = p_user and prayer = 'dhuhr' and status = 'jamaat'
        and extract(isodow from log_date) = 5), v_today, 7) s;
  return next;

  code := 'fajr_40';
  select s.best into progress from app_private.streak_stats(
    (select coalesce(array_agg(log_date), '{}') from public.prayer_logs
      where user_id = p_user and prayer = 'fajr' and status = 'jamaat'), v_today, 1) s;
  return next;

  code := 'zikr_master';
  select count(*) into progress from (
    select log_date from public.zikr_logs where user_id = p_user and done
    group by log_date having count(*) = 2) z;
  return next;

  code := 'first_para';
  select coalesce(max(pages), 0) into progress from public.quran_logs where user_id = p_user;
  return next;

  code := 'quran_7';
  select best into progress from app_private.quran_streak(p_user);
  return next;

  code := 'khatam';
  select coalesce(sum(pages), 0) into progress from public.quran_logs where user_id = p_user;
  return next;

  code := 'tahajjud_nights';
  select count(*) into progress from public.nafl_logs where user_id = p_user and name = 'tahajjud' and done;
  return next;
  code := 'duha_21';
  select count(*) into progress from public.nafl_logs where user_id = p_user and name = 'duha' and done;
  return next;
  code := 'witr_21';
  select count(*) into progress from public.nafl_logs where user_id = p_user and name = 'witr' and done;
  return next;
end;
$$;

create or replace function app_private.badges_json(p_user uuid)
returns jsonb
language sql stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', d.code, 'group', d.grp, 'name', d.name, 'description', d.note,
      'earned', bp.progress >= d.target,
      'progress', least(bp.progress, d.target), 'target', d.target,
      'visibility', d.visibility,
      'note', case
        when bp.progress >= d.target then 'Earned'
        when d.code = 'khatam' and bp.progress > 0
          then 'Para ' || least(30, bp.progress / 20 + 1) || ' of 30'
        when d.code = 'khatam' then '0 / 604 pages'
        when d.code = 'first_para' then 'Best day ' || bp.progress || ' / 20 pages'
        when d.code = 'jumuah_jamaat' then bp.progress || ' / 4 Fridays in a row'
        when d.code in ('first_week','streak_30') then bp.progress || ' / ' || d.target || ' days in a row'
        when d.code = 'zikr_master' then bp.progress || ' / 30 days both azkar'
        when d.code = 'tahajjud_nights' then bp.progress || ' / 3 nights'
        else bp.progress || ' / ' || d.target || ' days' end
    ) order by d.sort), '[]'::jsonb)
  from public.badge_defs d
  join app_private.badge_progress(p_user) bp on bp.code = d.code
$$;

create or replace function public.list_badges()
returns jsonb
language sql stable
security definer
set search_path = public
as $$ select app_private.badges_json(app_private.require_uid()) $$;

-- Friends see only earned badges whose visibility is 'friends'.
create or replace function public.friend_badges(p_friend_id uuid)
returns jsonb
language plpgsql stable
security definer
set search_path = public
as $$
declare v_uid uuid := app_private.require_uid();
begin
  if not app_private.are_friends(v_uid, p_friend_id) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', b->>'id', 'name', b->>'name', 'group', b->>'group'))
    from jsonb_array_elements(app_private.badges_json(p_friend_id)) b
    where (b->>'visibility') = 'friends' and (b->>'earned')::boolean), '[]'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------
-- Challenges
-- -----------------------------------------------------------------------------
create or replace function app_private.challenge_json(c public.challenges, p_viewer uuid)
returns jsonb
language sql stable
as $$
  with days as (select array_agg(d order by d) as arr from app_private.challenge_group_days(c) d),
  wk as (
    select app_private.user_today(p_viewer) as today,
           app_private.user_today(p_viewer) - (extract(isodow from app_private.user_today(p_viewer))::int - 1) as mon
  )
  select jsonb_build_object(
    'id', c.id, 'type', c.type, 'kind', c.kind, 'template', c.template, 'title', c.title,
    'prayer', c.prayer, 'slot', c.slot, 'pages', c.pages, 'weekdays', to_jsonb(c.weekdays),
    'progress', app_private.challenge_progress(c), 'target', c.target,
    'reward', c.reward, 'rewardGranted', c.reward_granted, 'startsOn', c.starts_on,
    'completed', app_private.challenge_progress(c) >= c.target,
    'isOwner', c.owner_id = p_viewer,
    'myStatus', case when c.owner_id = p_viewer then 'accepted'
                     else (select status from public.challenge_members
                           where challenge_id = c.id and user_id = p_viewer) end,
    'members', coalesce((
       select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'status', m.status)
                        order by (p.id = c.owner_id) desc, p.name)
       from (select user_id, status from public.challenge_members where challenge_id = c.id
             union select c.owner_id, 'accepted'
             where not exists (select 1 from public.challenge_members
                               where challenge_id = c.id and user_id = c.owner_id)) m
       join public.profiles p on p.id = m.user_id), '[]'::jsonb),
    'week', (select jsonb_agg(jsonb_build_object(
                      'date', w.mon + i,
                      'done', (w.mon + i) = any (coalesce((select arr from days), '{}'::date[])),
                      'future', (w.mon + i) > w.today)
                    order by i)
             from wk w, generate_series(0, 6) i)
  )
$$;

create or replace function public.list_challenges(p_type text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := app_private.require_uid();
begin
  if p_type not in ('friend','personal') then
    raise exception 'Unknown challenge type' using errcode = '22023';
  end if;
  perform app_private.check_challenges(v_uid);
  return coalesce((
    select jsonb_agg(app_private.challenge_json(c, v_uid) order by c.created_at desc)
    from public.challenges c
    where c.type = p_type
      and (c.owner_id = v_uid
           or (p_type = 'friend' and exists (
                 select 1 from public.challenge_members m
                 where m.challenge_id = c.id and m.user_id = v_uid)))), '[]'::jsonb);
end;
$$;

-- A user can be in at most ONE unfinished friend challenge per template, so the
-- same days cannot be counted for several rewards at once.
create or replace function app_private.has_open_template(p_user uuid, p_template text)
returns boolean
language sql stable
as $$
  select exists (
    select 1 from public.challenges c
    where c.type = 'friend' and c.template = p_template and not c.reward_granted
      and (c.owner_id = p_user or exists (
            select 1 from public.challenge_members m
            where m.challenge_id = c.id and m.user_id = p_user and m.status = 'accepted')))
$$;

create or replace function public.create_challenge(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := app_private.require_uid();
  v_type    text := payload ->> 'type';
  v_kind    text;
  v_tpl     text;
  v_prayer  text;
  v_slot    text;
  v_pages   int;
  v_target  int;
  v_reward  int := 0;
  v_days    int[];
  v_title   text;
  c         public.challenges;
  v_inv     uuid;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'Invalid challenge' using errcode = '22023';
  end if;
  if (select count(*) from public.challenges where owner_id = v_uid and created_at > now() - interval '1 day') >= 30 then
    raise exception 'Too many challenges created today' using errcode = '22023';
  end if;

  if v_type = 'friend' then
    -- Friend challenges come only from fixed templates; the server sets the
    -- reward so it cannot be inflated by the client.
    v_tpl := payload ->> 'template';
    case v_tpl
      when 'fajr7'   then v_kind := 'jamaat'; v_prayer := 'fajr';  v_target := 7; v_reward := 50; v_title := '7 days of Fajr in Jamaat';
      when 'jumuah'  then v_kind := 'jamaat'; v_prayer := 'dhuhr'; v_target := 1; v_reward := 20; v_title := 'Jumuah together'; v_days := array[5];
      when 'azkar7'  then v_kind := 'zikr';   v_slot := 'both';    v_target := 7; v_reward := 30; v_title := 'Azkar week';
      when 'weekend' then v_kind := 'namaz';                       v_target := 2; v_reward := 30; v_title := 'No-miss weekend'; v_days := array[6,7];
      else raise exception 'Unknown challenge template' using errcode = '22023';
    end case;
    if app_private.has_open_template(v_uid, v_tpl) then
      raise exception 'You already have an active "%" challenge', v_title using errcode = '22023';
    end if;

  elsif v_type = 'personal' then
    v_kind := payload ->> 'kind';
    if v_kind not in ('namaz','jamaat','zikr','quran') then
      raise exception 'Unknown challenge kind' using errcode = '22023';
    end if;
    begin
      v_target := (payload ->> 'target')::int;
      v_pages  := nullif(payload ->> 'pages', '')::int;
    exception when others then
      raise exception 'Target and pages must be whole numbers' using errcode = '22023';
    end;
    if v_target is null or v_target not between 1 and 365 then
      raise exception 'Days must be between 1 and 365' using errcode = '22023';
    end if;
    v_prayer := nullif(payload ->> 'prayer', 'all');
    if v_kind = 'jamaat' and v_prayer is not null and v_prayer not in ('fajr','dhuhr','asr','maghrib','isha') then
      raise exception 'Unknown prayer' using errcode = '22023';
    end if;
    if v_kind <> 'jamaat' then v_prayer := null; end if;
    if v_kind = 'zikr' then
      v_slot := coalesce(payload ->> 'slot', 'both');
      if v_slot not in ('morning','evening','both') then
        raise exception 'Unknown azkar slot' using errcode = '22023';
      end if;
    end if;
    if v_kind = 'quran' then
      if v_pages is null or v_pages not between 1 and 604 then
        raise exception 'Pages per day must be between 1 and 604' using errcode = '22023';
      end if;
    else
      v_pages := null;
    end if;
    v_title := btrim(coalesce(payload ->> 'title', ''));
    if v_title = '' then
      v_title := case v_kind
        when 'namaz'  then 'All 5 prayers for ' || v_target || ' days'
        when 'jamaat' then coalesce(initcap(v_prayer), 'All prayers') || ' in Jamaat, ' || v_target || ' days'
        when 'zikr'   then case v_slot when 'both' then 'Both azkar' else initcap(v_slot) || ' azkar' end || ', ' || v_target || ' days'
        else v_pages || ' pages a day for ' || v_target || ' days' end;
    end if;
    v_title := left(v_title, 80);
  else
    raise exception 'Unknown challenge type' using errcode = '22023';
  end if;

  insert into public.challenges (owner_id, type, kind, template, prayer, slot, pages, weekdays,
                                 target, title, reward, starts_on)
  values (v_uid, v_type, v_kind, v_tpl, v_prayer, v_slot, v_pages, v_days,
          v_target, v_title, v_reward, app_private.user_today(v_uid))
  returning * into c;

  insert into public.challenge_members (challenge_id, user_id, status) values (c.id, v_uid, 'accepted');

  if v_type = 'friend' and jsonb_typeof(payload -> 'invites') = 'array' then
    for v_inv in
      select distinct (x #>> '{}')::uuid from jsonb_array_elements(payload -> 'invites') x
      where (x #>> '{}') ~* '^[0-9a-f-]{36}$'
    loop
      if app_private.are_friends(v_uid, v_inv) then  -- only accepted friends
        insert into public.challenge_members (challenge_id, user_id, status)
        values (c.id, v_inv, 'invited') on conflict do nothing;
      end if;
    end loop;
  end if;

  return app_private.challenge_json(c, v_uid);
end;
$$;

create or replace function public.respond_challenge(p_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := app_private.require_uid();
  c     public.challenges;
begin
  select ch.* into c from public.challenges ch
  join public.challenge_members m on m.challenge_id = ch.id
  where ch.id = p_id and m.user_id = v_uid and m.status = 'invited' and ch.owner_id <> v_uid;
  if not found then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  if coalesce(p_accept, false) then
    if c.reward_granted then
      raise exception 'This challenge is already complete' using errcode = '22023';
    end if;
    if app_private.has_open_template(v_uid, c.template) then
      raise exception 'You are already in an active "%" challenge', c.title using errcode = '22023';
    end if;
    update public.challenge_members set status = 'accepted' where challenge_id = p_id and user_id = v_uid;
  else
    delete from public.challenge_members where challenge_id = p_id and user_id = v_uid;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.leave_challenge(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := app_private.require_uid();
begin
  -- owner deletes the challenge; a member leaves it
  delete from public.challenges where id = p_id and owner_id = v_uid;
  if not found then
    delete from public.challenge_members where challenge_id = p_id and user_id = v_uid;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- Weekly report (private): last full Mon-Sun week in the user's timezone
-- -----------------------------------------------------------------------------
create or replace function public.weekly_report(p_week_offset int default 0)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := app_private.require_uid();
  v_off      int := least(greatest(coalesce(p_week_offset, 0), 0), 52);
  v_today    date := app_private.user_today(v_uid);
  v_settings jsonb := (select app_private.default_settings() || settings from public.profiles where id = v_uid);
  v_from     date;
  v_to       date;
  v_any      int;
  v_jam      int; v_prev int; v_prayed int; v_qaza int;
  v_strong   record; v_weak record;
  v_zboth    int; v_zm int; v_ze int;
  v_qpages   int; v_qdays int;
  v_insight  text;
  v_run      record;
  v_wd_j     int; v_we_j int;
  v_fajr_miss int;
  v_smart    jsonb;
  v_goal     jsonb;
  v_names    text[] := array['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
begin
  v_from := v_today - (extract(isodow from v_today)::int - 1) - 7 * (v_off + 1);
  v_to   := v_from + 6;

  create temp table if not exists _wr_grid (d date, prayer text, ord int, status text) on commit drop;
  truncate _wr_grid;
  insert into _wr_grid
  select g.d::date, p.prayer, p.ord, l.status
  from generate_series(v_from, v_to, interval '1 day') g(d)
  cross join (values ('fajr',1),('dhuhr',2),('asr',3),('maghrib',4),('isha',5)) p(prayer, ord)
  left join public.prayer_logs l
    on l.user_id = v_uid and l.log_date = g.d::date and l.prayer = p.prayer;

  select count(*) filter (where status is not null) into v_any from _wr_grid;
  select count(*) filter (where status = 'jamaat'),
         count(*) filter (where status in ('jamaat','alone','qaza')),
         count(*) filter (where status = 'qaza')
    into v_jam, v_prayed, v_qaza from _wr_grid;
  select count(*) into v_prev from public.prayer_logs
   where user_id = v_uid and status = 'jamaat' and log_date between v_from - 7 and v_from - 1;

  -- strongest / weakest waqt by Jamaat count (ties -> earlier prayer)
  select prayer, count(*) filter (where status = 'jamaat') as j into v_strong
    from _wr_grid group by prayer, ord order by 2 desc, ord limit 1;
  select prayer, count(*) filter (where status = 'jamaat') as j into v_weak
    from _wr_grid group by prayer, ord order by 2 asc, ord limit 1;

  -- zikr
  select count(*) filter (where m and e), count(*) filter (where m), count(*) filter (where e)
    into v_zboth, v_zm, v_ze
  from (select g.d,
               coalesce(bool_or(z.done) filter (where z.slot = 'morning'), false) as m,
               coalesce(bool_or(z.done) filter (where z.slot = 'evening'), false) as e
        from generate_series(v_from, v_to, interval '1 day') g(d)
        left join public.zikr_logs z on z.user_id = v_uid and z.log_date = g.d::date
        group by g.d) t;

  select coalesce(sum(pages), 0), count(*) filter (where pages > 0) into v_qpages, v_qdays
    from public.quran_logs where user_id = v_uid and log_date between v_from and v_to;

  -- ---------------- "What I noticed" (rule-based, stored data only) ----------
  if v_any > 0 then
    -- 1) longest run of consecutive days a prayer was missed or not marked
    select prayer, ord, min(d) as s, max(d) as e, count(*) as n into v_run
    from (
      select prayer, ord, d, d - (row_number() over (partition by prayer order by d))::int as grp
      from _wr_grid where status is null or status = 'missed'
    ) x
    group by prayer, ord, grp
    having count(*) between 2 and 6   -- 7 = never logged, not a pattern
    order by count(*) desc, ord
    limit 1;
    if v_run.prayer is not null and v_run.n between 2 and 6 then
      v_insight := 'Your missed ' || initcap(v_run.prayer) || ' prayers were on consecutive days, '
                   || v_names[extract(isodow from v_run.s)::int] || ' to '
                   || v_names[extract(isodow from v_run.e)::int] || '.';
    end if;

    -- 2) weekend dip
    if v_insight is null then
      select count(*) filter (where status = 'jamaat' and extract(isodow from d) < 6),
             count(*) filter (where status = 'jamaat' and extract(isodow from d) >= 6)
        into v_wd_j, v_we_j from _wr_grid;
      if v_wd_j > 0 and (v_wd_j::numeric / 25 - v_we_j::numeric / 10) >= 0.2 then
        v_insight := 'Jamaat dipped at the weekend: ' || v_we_j || ' of 10 on Saturday and Sunday, '
                     || v_wd_j || ' of 25 on weekdays.';
      end if;
    end if;

    -- 3) improvement vs last week
    if v_insight is null and v_jam > v_prev and v_prev > 0 then
      v_insight := 'You prayed ' || (v_jam - v_prev) || ' more in Jamaat than the week before.';
    end if;

    -- 4) weakest waqt
    if v_insight is null and v_weak.j < v_strong.j then
      v_insight := initcap(v_weak.prayer) || ' needs the most care: ' || v_weak.j || ' of 7 in Jamaat.';
    end if;

    if v_insight is null and v_jam = 35 then
      v_insight := 'Every prayer in Jamaat this week. Alhamdulillah.';
    end if;
  end if;

  -- ---------------- Smart fix ------------------------------------------------
  select count(*) into v_fajr_miss from _wr_grid
   where prayer = 'fajr' and (status is null or status = 'missed');
  if v_any > 0 and v_fajr_miss >= 3 and app_private.setting_bool(v_settings, 'smartFix') then
    v_smart := jsonb_build_object('prayer', 'fajr', 'misses', v_fajr_miss,
                                  'choice', v_settings -> 'smartFixChoice');
  end if;

  -- ---------------- Next week's goal -----------------------------------------
  if v_weak.j < 5 then
    v_goal := jsonb_build_object('kind', 'jamaat', 'prayer', v_weak.prayer, 'target', 5,
              'title', initcap(v_weak.prayer) || ' in Jamaat 5 of 7 days');
  elsif v_qdays < 7 then
    v_goal := jsonb_build_object('kind', 'quran', 'pages', 5, 'target', 7,
              'title', 'Read 5 pages a day for 7 days');
  else
    v_goal := jsonb_build_object('kind', 'namaz', 'target', 7, 'title', 'All 5 prayers for 7 days');
  end if;

  return jsonb_build_object(
    'from', v_from, 'to', v_to, 'hasData', v_any > 0,
    'jamaat', jsonb_build_object('done', v_jam, 'total', 35, 'prev', v_prev),
    'prayed', jsonb_build_object('done', v_prayed, 'total', 35, 'qaza', v_qaza),
    'perDay', (select jsonb_agg(jsonb_build_object(
                  'day', (array['M','T','W','T','F','S','S'])[extract(isodow from d)::int],
                  'date', d, 'jamaat', j, 'alone', a) order by d)
               from (select d, count(*) filter (where status = 'jamaat') j,
                               count(*) filter (where status = 'alone') a
                     from _wr_grid group by d) pd),
    'strongest', case when v_strong.j > 0 then
                   jsonb_build_object('prayer', v_strong.prayer, 'jamaat', v_strong.j, 'of', 7) end,
    'weakest', case when v_weak.j < v_strong.j then
                 jsonb_build_object('prayer', v_weak.prayer, 'jamaat', v_weak.j, 'of', 7) end,
    'zikr', jsonb_build_object('days', v_zboth, 'of', 7,
              'missed', case when v_zm = 7 and v_ze = 7 then null
                             when v_zm < v_ze then 'morning'
                             when v_ze < v_zm then 'evening'
                             else 'both' end,
              'missedCount', 7 - least(v_zm, v_ze)),
    'quran', jsonb_build_object('pages', v_qpages, 'days', v_qdays, 'of', 7),
    'nafl', jsonb_build_object('items', coalesce((
              select jsonb_agg(jsonb_build_object('name', name, 'label', label, 'days', days) order by ord)
              from (select n.name, n.label, n.ord, count(l.*) filter (where l.done) as days
                    from (values ('duha','Duha',1),('tahajjud','Tahajjud',2),('witr','Witr',3),
                                 ('sunnah','Sunnah rawatib',4),('ishraq','Ishraq',5)) n(name, label, ord)
                    left join public.nafl_logs l
                      on l.user_id = v_uid and l.name = n.name and l.log_date between v_from and v_to
                    group by n.name, n.label, n.ord) t
              where days > 0), '[]'::jsonb)),
    'insight', v_insight,
    'smartFix', v_smart,
    'nextGoal', v_goal
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Account
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
    'friends',    coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name))
                            from public.profiles p where p.id in (select app_private.friend_ids(v_uid))), '[]'),
    'friendRequestsSent', coalesce((select jsonb_agg(jsonb_build_object('email', email::text, 'createdAt', created_at))
                            from public.friend_requests where requester = v_uid), '[]'),
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

create or replace function public.delete_my_account(p_confirm text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := app_private.require_uid();
  v_mine text;
begin
  if p_confirm is distinct from 'DELETE' then
    raise exception 'Type DELETE to confirm' using errcode = '22023';
  end if;
  select lower(email) into v_mine from auth.users where id = v_uid;
  delete from public.friend_requests where email = v_mine;  -- requests TO me are keyed by email
  delete from auth.users where id = v_uid;                  -- cascades to profile and every log
  return jsonb_build_object('ok', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- Execute privileges: only signed-in users may call the public RPCs.
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema app_private from public, anon, authenticated;
grant execute on function app_private.is_challenge_member(uuid) to authenticated;
grant execute on function app_private.is_challenge_owner(uuid) to authenticated;

grant execute on function
  public.set_prayer(date, text, text),
  public.set_zikr(date, text, boolean),
  public.set_quran(date, int),
  public.set_nafl(date, text, boolean, int),
  public.get_quran_total(),
  public.update_settings(jsonb),
  public.get_me(),
  public.get_leaderboard(text),
  public.get_profile_summary(),
  public.send_friend_request(text),
  public.list_friend_requests(),
  public.accept_friend_request(uuid),
  public.remove_friend(uuid),
  public.friend_heatmap(uuid, int),
  public.friend_quran_streak(uuid),
  public.list_badges(),
  public.friend_badges(uuid),
  public.list_challenges(text),
  public.create_challenge(jsonb),
  public.respond_challenge(uuid, boolean),
  public.leave_challenge(uuid),
  public.weekly_report(int),
  public.export_my_data(),
  public.delete_my_account(text)
to authenticated;
