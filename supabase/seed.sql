-- Local development seed (run by `supabase db reset`, never by `db push`).
-- Badge definitions are repeated here idempotently; the production copy lives
-- in migrations/20261111000003_badge_defs.sql.
insert into public.badge_defs (code, grp, name, note, target, visibility, sort) values
  ('first_week',      'namaz',   'First Jamaat week',  '7 complete days in a row',             7,   'friends', 1),
  ('jumuah_jamaat',   'namaz',   'Jumuah Jamaat',      'Dhuhr in Jamaat on 4 Fridays in a row', 4,   'friends', 2),
  ('zikr_master',     'namaz',   'Zikr Master',        'Both azkar on 30 days',                30,  'friends', 3),
  ('fajr_40',         'namaz',   '40-day Fajr',        'Fajr in Jamaat 40 days in a row',      40,  'friends', 4),
  ('streak_30',       'namaz',   '30-day streak',      '30 complete days in a row',            30,  'friends', 5),
  ('first_para',      'quran',   'First para',         'Read 1 para in a day',                 20,  'private', 6),
  ('quran_7',         'quran',   '7-day Quran streak', 'Quran on 7 days in a row',             7,   'private', 7),
  ('khatam',          'quran',   'Khatam',             'All 604 pages',                        604, 'private', 8),
  ('tahajjud_nights', 'private', 'Tahajjud nights',    'Prayed 3 nights',                      3,   'private', 9),
  ('duha_21',         'private', 'Duha habit',         'Duha on 21 days',                      21,  'private', 10),
  ('witr_21',         'private', 'Witr keeper',        'Witr on 21 days',                      21,  'private', 11)
on conflict (code) do nothing;

-- Optional demo data for local dev: two friends with three weeks of history.
-- Password for both: password123 (only works with the real Supabase auth
-- schema from `supabase start`; skipped on plain Postgres).
do $$
declare
  v_a uuid := '00000000-0000-4000-8000-00000000000a';
  v_b uuid := '00000000-0000-4000-8000-00000000000b';
  d   date;
  p   text;
  i   int := 0;
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'auth' and table_name = 'users' and column_name = 'encrypted_password') then
    raise notice 'seed: plain Postgres detected, skipping demo users';
    return;
  end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values
    ('00000000-0000-0000-0000-000000000000', v_a, 'authenticated', 'authenticated', 'demo@zikr.local',
     extensions.crypt('password123', extensions.gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{"name":"Demo","timezone":"Asia/Kolkata"}', now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_b, 'authenticated', 'authenticated', 'zaid@zikr.local',
     extensions.crypt('password123', extensions.gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{"name":"Zaid","timezone":"Asia/Kolkata"}', now(), now(), '', '', '', '')
  on conflict (id) do nothing;

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values
    (gen_random_uuid(), v_a, v_a::text, jsonb_build_object('sub', v_a::text, 'email', 'demo@zikr.local'), 'email', now(), now(), now()),
    (gen_random_uuid(), v_b, v_b::text, jsonb_build_object('sub', v_b::text, 'email', 'zaid@zikr.local'), 'email', now(), now(), now())
  on conflict do nothing;

  insert into public.friendships (requester, addressee) values (v_a, v_b) on conflict do nothing;

  for d in select g::date from generate_series(current_date - 20, current_date - 1, interval '1 day') g loop
    i := i + 1;
    foreach p in array array['fajr','dhuhr','asr','maghrib','isha'] loop
      insert into public.prayer_logs (user_id, log_date, prayer, status, eligible, points)
      values (v_a, d, p, case when p = 'fajr' and i % 4 = 0 then 'missed' when i % 3 = 0 then 'alone' else 'jamaat' end, false, 0),
             (v_b, d, p, 'jamaat', false, 0)
      on conflict do nothing;
    end loop;
    insert into public.zikr_logs (user_id, log_date, slot, done, eligible) values
      (v_a, d, 'morning', true, false), (v_a, d, 'evening', i % 2 = 0, false) on conflict do nothing;
    insert into public.quran_logs (user_id, log_date, pages) values (v_a, d, (i % 4) * 4) on conflict do nothing;
    insert into public.nafl_logs (user_id, log_date, name, done) values
      (v_a, d, 'duha', i % 2 = 0), (v_a, d, 'witr', true) on conflict do nothing;
  end loop;
end $$;
