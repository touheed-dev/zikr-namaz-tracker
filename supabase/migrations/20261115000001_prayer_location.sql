-- =============================================================================
-- Migration: 20261115000001_prayer_location.sql
-- Goal: On-device offline prayer times with location and calculation settings
-- Adds: lat, lng, locationLabel, method, madhab, highLat, ishaEnd to settings
-- =============================================================================

-- 1. Update app_private.default_settings() with default prayer calculation values
-- -----------------------------------------------------------------------------
create or replace function app_private.default_settings()
returns jsonb
language sql immutable
as $$
  select jsonb_build_object(
    'city', 'Mumbai', 'country', 'India', 'method', 1, 'asr', 'standard',
    'lat', null, 'lng', null, 'locationLabel', null,
    'madhab', 'hanafi', 'highLat', 'none', 'ishaEnd', 'fajr',
    'azanAlert', true, 'jamaatNudge', true, 'azkarReminder', false,
    'smartFix', true, 'smartFixChoice', null,
    'shareStats', true, 'shareHeatmap', false, 'shareQuran', false,
    'weeklyReport', true, 'showHadith', true,
    'showOnGlobal', false
  )
$$;

-- 2. Update update_settings(patch jsonb) to validate and save location & prayer settings
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
    elsif k = 'lat' then
      if not (jsonb_typeof(v) = 'null' or (jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric between -90 and 90)) then
        raise exception 'lat must be between -90 and 90' using errcode = '22023';
      end if;
      v_clean := v_clean || jsonb_build_object(k, case when jsonb_typeof(v) = 'null' then 'null'::jsonb else round((v #>> '{}')::numeric, 2) end);
    elsif k = 'lng' then
      if not (jsonb_typeof(v) = 'null' or (jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric between -180 and 180)) then
        raise exception 'lng must be between -180 and 180' using errcode = '22023';
      end if;
      v_clean := v_clean || jsonb_build_object(k, case when jsonb_typeof(v) = 'null' then 'null'::jsonb else round((v #>> '{}')::numeric, 2) end);
    elsif k in ('locationLabel', 'label') then
      if not (jsonb_typeof(v) = 'null' or (jsonb_typeof(v) = 'string' and char_length(btrim(v #>> '{}')) <= 80)) then
        raise exception '% must be at most 80 characters', k using errcode = '22023';
      end if;
      v_clean := v_clean || jsonb_build_object(k, case when jsonb_typeof(v) = 'null' then 'null'::jsonb else to_jsonb(btrim(v #>> '{}')) end);
    elsif k = 'method' then
      if jsonb_typeof(v) = 'number' then
        if (v #>> '{}')::numeric not in (1,2,3,4,5) then
          raise exception 'Method must be 1 to 5' using errcode = '22023';
        end if;
        v_clean := v_clean || jsonb_build_object(k, (v #>> '{}')::int);
      elsif jsonb_typeof(v) = 'string' then
        if lower(btrim(v #>> '{}')) not in ('karachi', 'mwl', 'isna', 'umm_al_qura', 'ummalqura', 'egyptian', 'dubai', 'singapore') then
          raise exception 'Method must be one of: karachi, mwl, isna, umm_al_qura, egyptian, dubai, singapore' using errcode = '22023';
        end if;
        v_clean := v_clean || jsonb_build_object(k, lower(btrim(v #>> '{}')));
      else
        raise exception 'Method must be 1 to 5 or valid method name' using errcode = '22023';
      end if;
    elsif k = 'asr' then
      if jsonb_typeof(v) <> 'string' or (v #>> '{}') not in ('standard','hanafi') then
        raise exception 'Asr must be standard or hanafi' using errcode = '22023';
      end if;
      v_clean := v_clean || jsonb_build_object(k, v);
    elsif k = 'madhab' then
      if jsonb_typeof(v) <> 'string' or lower(btrim(v #>> '{}')) not in ('hanafi', 'shafi') then
        raise exception 'madhab must be hanafi or shafi' using errcode = '22023';
      end if;
      v_clean := v_clean || jsonb_build_object(k, lower(btrim(v #>> '{}')));
    elsif k = 'highLat' then
      if jsonb_typeof(v) <> 'string' or lower(btrim(v #>> '{}')) not in ('none', 'middleofthenight', 'seventhofthenight', 'twilightangle', 'middle_of_the_night', 'seventh_of_the_night', 'twilight_angle') then
        raise exception 'highLat must be none, middleofthenight, seventhofthenight, or twilightangle' using errcode = '22023';
      end if;
      v_clean := v_clean || jsonb_build_object(k, lower(btrim(v #>> '{}')));
    elsif k = 'ishaEnd' then
      if jsonb_typeof(v) <> 'string' or lower(btrim(v #>> '{}')) not in ('midnight', 'fajr') then
        raise exception 'ishaEnd must be midnight or fajr' using errcode = '22023';
      end if;
      v_clean := v_clean || jsonb_build_object(k, lower(btrim(v #>> '{}')));
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

-- 3. Update export_my_data() to explicitly include prayer location in export
-- -----------------------------------------------------------------------------
create or replace function public.export_my_data()
returns jsonb
language plpgsql stable
security definer
set search_path = public
as $$
declare
  v_uid      uuid := app_private.require_uid();
  v_settings jsonb;
begin
  select app_private.default_settings() || settings into v_settings
  from public.profiles where id = v_uid;

  return jsonb_build_object(
    'exportedAt', app_private.now(),
    'user', app_private.user_json(v_uid),
    'prayerLocation', jsonb_build_object(
      'lat', v_settings->'lat',
      'lng', v_settings->'lng',
      'label', coalesce(v_settings->'locationLabel', v_settings->'label', v_settings->'city')
    ),
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

-- 4. Permissions
-- -----------------------------------------------------------------------------
grant execute on function public.update_settings(jsonb) to authenticated;
revoke execute on function public.update_settings(jsonb) from public, anon;

grant execute on function public.export_my_data() to authenticated;
revoke execute on function public.export_my_data() from public, anon;
