-- Quran Listening: progress, logs, summary, privacy, and points invariants
\set ON_ERROR_STOP 1
\set QUIET 1
begin;
\ir _helpers.sql

select tests.set_clock('2026-11-14 12:00:00+00');
select tests.new_user('listen_u1@test.dev', 'Listen User 1', 'Asia/Kolkata') as u1 \gset
select tests.new_user('listen_u2@test.dev', 'Listen User 2', 'Asia/Kolkata') as u2 \gset

-- -----------------------------------------------------------------------------
-- 1. set_listen_position argument validation & upsert
-- -----------------------------------------------------------------------------
select tests.login(:'u1');
set local role authenticated;

select tests.throws($q$ select set_listen_position('', 1, 0) $q$, 'Invalid reciter', 'empty reciter rejected');
select tests.throws($q$ select set_listen_position(repeat('a', 61), 1, 0) $q$, 'Invalid reciter', 'reciter > 60 chars rejected');
select tests.throws($q$ select set_listen_position(null, 1, 0) $q$, 'Invalid reciter', 'null reciter rejected');
select tests.throws($q$ select set_listen_position('Yasser Al-Dosari', 0, 0) $q$, 'Invalid surah', 'surah 0 rejected');
select tests.throws($q$ select set_listen_position('Yasser Al-Dosari', 115, 0) $q$, 'Invalid surah', 'surah 115 rejected');
select tests.throws($q$ select set_listen_position('Yasser Al-Dosari', 1, -1) $q$, 'Invalid position', 'negative position rejected');
select tests.throws($q$ select set_listen_position('Yasser Al-Dosari', 1, 43200) $q$, 'Invalid position', 'position >= 43200 rejected');

select set_listen_position('Yasser Al-Dosari', 18, 125.5);
select tests.eq(
  (select jsonb_build_object('surah', surah::int, 'pos', position_seconds::numeric, 'reciter', reciter::text)
   from public.quran_listen_progress where user_id = :'u1'::uuid),
  jsonb_build_object('surah', 18, 'pos', 125.5::numeric, 'reciter', 'Yasser Al-Dosari'::text),
  'set_listen_position upserts progress'
);

-- Update same user's progress
select set_listen_position('Mishary Rashid Alafasy', 19, 45.0);
select tests.eq(
  (select jsonb_build_object('surah', surah::int, 'pos', position_seconds::numeric, 'reciter', reciter::text)
   from public.quran_listen_progress where user_id = :'u1'::uuid),
  jsonb_build_object('surah', 19, 'pos', 45.0::numeric, 'reciter', 'Mishary Rashid Alafasy'::text),
  'set_listen_position updates existing progress'
);

reset role;

-- -----------------------------------------------------------------------------
-- 2. add_listen_seconds: per-call limits (1..300) and daily cap (86400)
-- -----------------------------------------------------------------------------
select tests.login(:'u1');
set local role authenticated;

select tests.throws($q$ select add_listen_seconds(0) $q$, 'Seconds must be between 1 and 300', '0 seconds rejected');
select tests.throws($q$ select add_listen_seconds(-10) $q$, 'Seconds must be between 1 and 300', 'negative seconds rejected');
select tests.throws($q$ select add_listen_seconds(301) $q$, 'Seconds must be between 1 and 300', '> 300 seconds rejected');
select tests.throws($q$ select add_listen_seconds(null) $q$, 'Seconds must be between 1 and 300', 'null seconds rejected');

select add_listen_seconds(60);
select add_listen_seconds(120);

select tests.eq(
  (select seconds from public.quran_listen_logs where user_id = :'u1'::uuid and log_date = '2026-11-14')::int,
  180,
  'add_listen_seconds accumulates seconds for today'
);

reset role;

-- -----------------------------------------------------------------------------
-- 3. Daily cap: seconds capped at 86400 & direct writes denied
-- -----------------------------------------------------------------------------
select tests.login(:'u1');
set local role authenticated;

-- Direct writes by client are denied
select tests.throws(
  $q$ insert into public.quran_listen_progress (user_id, reciter, surah, position_seconds) values (auth.uid(), 'Yasser Al-Dosari', 1, 0) $q$,
  'permission denied',
  'authenticated user denied direct insert on quran_listen_progress'
);
select tests.throws(
  $q$ update public.quran_listen_progress set surah = 2 $q$,
  'permission denied',
  'authenticated user denied direct update on quran_listen_progress'
);
select tests.throws(
  $q$ delete from public.quran_listen_progress $q$,
  'permission denied',
  'authenticated user denied direct delete on quran_listen_progress'
);
select tests.throws(
  $q$ insert into public.quran_listen_logs (user_id, log_date, seconds) values (auth.uid(), '2026-11-14', 10) $q$,
  'permission denied',
  'authenticated user denied direct insert on quran_listen_logs'
);
select tests.throws(
  $q$ update public.quran_listen_logs set seconds = 10 $q$,
  'permission denied',
  'authenticated user denied direct update on quran_listen_logs'
);
select tests.throws(
  $q$ delete from public.quran_listen_logs $q$,
  'permission denied',
  'authenticated user denied direct delete on quran_listen_logs'
);

-- Force seconds near max to test cap (setup runs as superuser)
reset role;
update public.quran_listen_logs set seconds = 86350 where user_id = :'u1'::uuid and log_date = '2026-11-14';
select tests.login(:'u1');
set local role authenticated;

select add_listen_seconds(100);

select tests.eq(
  (select seconds from public.quran_listen_logs where user_id = :'u1'::uuid and log_date = '2026-11-14')::int,
  86400,
  'daily listening seconds capped at 86400'
);

reset role;

-- -----------------------------------------------------------------------------
-- 4. get_listen_summary: returns today, week, total, position, khatamSurah
-- -----------------------------------------------------------------------------
-- Reset logs to realistic values: today (Saturday) 180s, yesterday (Friday) 300s (setup runs as superuser)
reset role;
update public.quran_listen_logs set seconds = 180 where user_id = :'u1'::uuid and log_date = '2026-11-14';
insert into public.quran_listen_logs (user_id, log_date, seconds)
values (:'u1'::uuid, '2026-11-13', 300);

select tests.login(:'u1');
set local role authenticated;

select tests.eq(
  get_listen_summary(),
  jsonb_build_object(
    'today', 180,
    'week', 480,
    'total', 480,
    'position', jsonb_build_object('reciter', 'Mishary Rashid Alafasy'::text, 'surah', 19, 'position_seconds', 45.0::numeric),
    'khatamSurah', 18
  ),
  'get_listen_summary returns correct metrics and khatamSurah'
);

reset role;

-- User with no listening history gets clean defaults
select tests.login(:'u2');
set local role authenticated;

select tests.eq(
  get_listen_summary(),
  jsonb_build_object(
    'today', 0,
    'week', 0,
    'total', 0,
    'position', null,
    'khatamSurah', 0
  ),
  'get_listen_summary returns clean zeroes for fresh user'
);

reset role;

-- -----------------------------------------------------------------------------
-- 5. Privacy: User A cannot read User B's listening rows
-- -----------------------------------------------------------------------------
select tests.login(:'u2');
set local role authenticated;

select tests.eq(
  (select count(*) from public.quran_listen_progress where user_id = :'u1'::uuid)::int,
  0,
  'RLS prevents user 2 from reading user 1 listen progress'
);

select tests.eq(
  (select count(*) from public.quran_listen_logs where user_id = :'u1'::uuid)::int,
  0,
  'RLS prevents user 2 from reading user 1 listen logs'
);

reset role;

-- -----------------------------------------------------------------------------
-- 6. Anon denied
-- -----------------------------------------------------------------------------
set local role anon;

select tests.throws(
  $q$ select set_listen_position('Yasser Al-Dosari', 1, 0) $q$,
  'permission denied',
  'anon denied set_listen_position'
);

select tests.throws(
  $q$ select add_listen_seconds(60) $q$,
  'permission denied',
  'anon denied add_listen_seconds'
);

select tests.throws(
  $q$ select get_listen_summary() $q$,
  'permission denied',
  'anon denied get_listen_summary'
);

select tests.throws(
  $q$ select * from public.quran_listen_progress $q$,
  'permission denied',
  'anon denied table select on quran_listen_progress'
);

select tests.throws(
  $q$ select * from public.quran_listen_logs $q$,
  'permission denied',
  'anon denied table select on quran_listen_logs'
);

reset role;

-- -----------------------------------------------------------------------------
-- 7. export_my_data includes listenProgress and listenLogs
-- -----------------------------------------------------------------------------
select tests.login(:'u1');
set local role authenticated;

select tests.ok(
  (export_my_data() ? 'listenProgress'),
  'export_my_data includes listenProgress key'
);

select tests.ok(
  (export_my_data() ? 'listenLogs'),
  'export_my_data includes listenLogs key'
);

select tests.eq(
  (export_my_data() -> 'listenProgress' ->> 'surah')::int,
  19,
  'export_my_data has correct listenProgress surah'
);

select tests.eq(
  jsonb_array_length(export_my_data() -> 'listenLogs')::int,
  2,
  'export_my_data has both listenLogs entries'
);

reset role;

-- -----------------------------------------------------------------------------
-- 8. Leaderboard points UNCHANGED by listening
-- Listening NEVER awards points and never logs prayer / Quran read pages.
-- -----------------------------------------------------------------------------
select tests.login(:'u1');
set local role authenticated;

-- Ensure user is on friends leaderboard
select tests.eq(
  (select points from public.get_leaderboard('week') where is_me = true)::int,
  0,
  'user 1 has 0 leaderboard points before/after listening'
);

select tests.eq(
  (select count(*) from public.quran_logs where user_id = :'u1'::uuid)::int,
  0,
  'listening does not create quran_logs (reading) rows'
);

reset role;

rollback;
