-- =============================================================================
-- Migration: Quran Listening (Audio recitations, progress & logs)
-- =============================================================================

-- 1. Table: quran_listen_progress
-- -----------------------------------------------------------------------------
create table if not exists public.quran_listen_progress (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  reciter text not null check (length(reciter) between 1 and 60),
  surah int not null check (surah between 1 and 114),
  position_seconds numeric not null check (position_seconds >= 0 and position_seconds < 43200),
  updated_at timestamptz not null default now()
);

alter table public.quran_listen_progress enable row level security;

create policy quran_listen_progress_select on public.quran_listen_progress
  for select using (user_id = auth.uid());

revoke all on table public.quran_listen_progress from public, anon, authenticated;
grant select on table public.quran_listen_progress to authenticated;

-- 2. Table: quran_listen_logs
-- -----------------------------------------------------------------------------
create table if not exists public.quran_listen_logs (
  user_id uuid not null references public.profiles(id) on delete cascade,
  log_date date not null,
  seconds int not null check (seconds between 0 and 86400),
  primary key (user_id, log_date)
);

alter table public.quran_listen_logs enable row level security;

create policy quran_listen_logs_select on public.quran_listen_logs
  for select using (user_id = auth.uid());

revoke all on table public.quran_listen_logs from public, anon, authenticated;
grant select on table public.quran_listen_logs to authenticated;

-- 3. RPC: set_listen_position
-- -----------------------------------------------------------------------------
create or replace function public.set_listen_position(
  p_reciter text,
  p_surah int,
  p_position numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := app_private.require_uid();
begin
  if p_reciter is null or length(trim(p_reciter)) < 1 or length(trim(p_reciter)) > 60 then
    raise 'Invalid reciter';
  end if;
  if p_surah is null or p_surah < 1 or p_surah > 114 then
    raise 'Invalid surah';
  end if;
  if p_position is null or p_position < 0 or p_position >= 43200 then
    raise 'Invalid position';
  end if;

  insert into public.quran_listen_progress (user_id, reciter, surah, position_seconds, updated_at)
  values (v_uid, trim(p_reciter), p_surah, p_position, app_private.now())
  on conflict (user_id) do update set
    reciter = excluded.reciter,
    surah = excluded.surah,
    position_seconds = excluded.position_seconds,
    updated_at = excluded.updated_at;
end;
$$;

-- 4. RPC: add_listen_seconds
-- -----------------------------------------------------------------------------
create or replace function public.add_listen_seconds(p_seconds int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := app_private.require_uid();
  v_today date := app_private.user_today(v_uid);
begin
  if p_seconds is null or p_seconds < 1 or p_seconds > 300 then
    raise 'Seconds must be between 1 and 300';
  end if;

  insert into public.quran_listen_logs (user_id, log_date, seconds)
  values (v_uid, v_today, least(p_seconds, 86400))
  on conflict (user_id, log_date) do update set
    seconds = least(public.quran_listen_logs.seconds + excluded.seconds, 86400);
end;
$$;

-- 5. RPC: get_listen_summary
-- -----------------------------------------------------------------------------
create or replace function public.get_listen_summary()
returns jsonb
language plpgsql stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := app_private.require_uid();
  v_today date := app_private.user_today(v_uid);
  v_mon date := v_today - (extract(isodow from v_today)::int - 1);
  v_today_sec int;
  v_week_sec int;
  v_total_sec int;
  v_pos jsonb;
  v_surah int;
begin
  select seconds into v_today_sec
  from public.quran_listen_logs
  where user_id = v_uid and log_date = v_today;

  select coalesce(sum(seconds)::int, 0) into v_week_sec
  from public.quran_listen_logs
  where user_id = v_uid and log_date between v_mon and v_today;

  select coalesce(sum(seconds)::int, 0) into v_total_sec
  from public.quran_listen_logs
  where user_id = v_uid;

  select
    jsonb_build_object(
      'reciter', reciter,
      'surah', surah,
      'position_seconds', position_seconds
    ),
    surah
  into v_pos, v_surah
  from public.quran_listen_progress
  where user_id = v_uid;

  return jsonb_build_object(
    'today', coalesce(v_today_sec, 0),
    'week', v_week_sec,
    'total', v_total_sec,
    'position', v_pos,
    'khatamSurah', coalesce(v_surah - 1, 0)
  );
end;
$$;

-- 6. Update export_my_data to include listenProgress and listenLogs
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
    'listenProgress', (select to_jsonb(p) - 'user_id'
                       from public.quran_listen_progress p
                       where p.user_id = v_uid),
    'listenLogs', coalesce((select jsonb_agg(to_jsonb(t) - 'user_id' order by log_date)
                            from public.quran_listen_logs t
                            where t.user_id = v_uid), '[]'),
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

-- 7. Grants on new public RPCs & permission hardening
-- -----------------------------------------------------------------------------
grant execute on function
  public.set_listen_position(text, int, numeric),
  public.add_listen_seconds(int),
  public.get_listen_summary()
to authenticated;

revoke execute on function
  public.set_listen_position(text, int, numeric),
  public.add_listen_seconds(int),
  public.get_listen_summary()
from public, anon;
