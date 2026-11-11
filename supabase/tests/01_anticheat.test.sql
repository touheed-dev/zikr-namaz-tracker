-- Anti-cheat: 3-day window judged by the server clock in the user's timezone,
-- edits earn 0, clears are edits, missed -> qaza once, future dates rejected,
-- no direct writes, bonuses only from eligible non-edited rows.
\set ON_ERROR_STOP 1
\set QUIET 1
begin;
\ir _helpers.sql

-- 2026-11-11 12:00 UTC = 17:30 in India (Wed 11 Nov), 04:00 in Los Angeles
select tests.set_clock('2026-11-11 12:00:00+00');
select tests.new_user('a@test.dev', 'Ali',  'Asia/Kolkata')        as a \gset
select tests.new_user('b@test.dev', 'Bilal', 'America/Los_Angeles') as b \gset

select tests.eq((select name from profiles where id = :'a'), 'Ali', 'signup trigger creates profile with name');
select tests.eq((select timezone from profiles where id = :'b'), 'America/Los_Angeles', 'signup trigger stores IANA timezone');
select tests.new_user('bad-tz@test.dev', '', 'Mars/Olympus') as badtz \gset
select tests.eq((select timezone from profiles where id = :'badtz'), 'Asia/Kolkata', 'invalid timezone falls back to Asia/Kolkata');
select tests.eq((select name from profiles where id = :'badtz'), 'bad-tz', 'empty name falls back to email local part');

-- Supabase Auth itself (role supabase_auth_admin) can sign a user up through the trigger
set local role supabase_auth_admin;
insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-4000-8000-0000000000aa', 'auth-admin@test.dev', '{"name":"Via Auth","timezone":"Europe/Paris"}');
reset role;
select tests.eq((select timezone from profiles where id = '00000000-0000-4000-8000-0000000000aa'), 'Europe/Paris',
                'signup as supabase_auth_admin creates the profile');

-- ---------------------------------------------------------------- user A
select tests.login(:'a');
set local role authenticated;

select tests.eq((set_prayer('2026-11-11', 'fajr', 'jamaat') ->> 'points')::int, 10, 'jamaat today = 10');
select tests.eq((set_prayer('2026-11-11', 'fajr', 'jamaat') ->> 'edited')::boolean, false, 'repeating the same status (double click) is not an edit');
select tests.eq((select points from prayer_logs where log_date = '2026-11-11' and prayer = 'fajr'), 10, 'repeat keeps 10 points');

select tests.eq((set_prayer('2026-11-11', 'fajr', 'alone') ->> 'points')::int, 0, 'changing status = edit = 0 points');
select tests.eq((set_prayer('2026-11-11', 'fajr', 'jamaat') ->> 'points')::int, 0, 'changing back still 0 (edited forever)');
select tests.ok((set_prayer('2026-11-11', 'fajr', null) ->> 'status') is null, 'clearing returns status null');
select tests.ok((select status is null and edited and points = 0 from prayer_logs
                  where log_date = '2026-11-11' and prayer = 'fajr'), 'clear keeps the row (no hard delete), edited, 0 pts');
select tests.eq((set_prayer('2026-11-11', 'fajr', 'jamaat') ->> 'points')::int, 0, 'clear then re-add cannot earn points again');

select tests.eq((set_prayer('2026-11-11', 'dhuhr', 'alone') ->> 'points')::int, 4, 'alone today = 4');
select tests.eq((set_prayer('2026-11-09', 'dhuhr', 'alone') ->> 'points')::int, 4, 'two days ago is inside the window');
select tests.eq((set_prayer('2026-11-08', 'dhuhr', 'jamaat') ->> 'points')::int, 0, 'three days ago = record only, 0 pts');
select tests.eq((set_prayer('2026-11-07', 'dhuhr', 'jamaat') ->> 'points')::int, 0, 'four days ago = 0 pts');
select tests.ok((select not eligible from prayer_logs where log_date = '2026-11-07' and prayer = 'dhuhr'), 'old row stored as not eligible');

select tests.throws($q$ select set_prayer('2026-11-12', 'asr', 'jamaat') $q$, 'Future dates', 'future date rejected');
select tests.throws($q$ select set_prayer('2026-11-11', 'tahajjud', 'jamaat') $q$, 'Unknown prayer', 'invalid prayer rejected');
select tests.throws($q$ select set_prayer('2026-11-11', 'asr', 'late') $q$, 'Unknown status', 'invalid status rejected');
select tests.throws($q$ select set_prayer(null, 'asr', 'jamaat') $q$, 'Date is required', 'null date rejected');

-- missed -> qaza: +2 once, not an edit
select tests.eq((set_prayer('2026-11-10', 'asr', 'missed') ->> 'points')::int, 0, 'missed = 0');
select tests.eq((set_prayer('2026-11-10', 'asr', 'qaza') ->> 'points')::int, 2, 'missed -> qaza made up = 2');
select tests.ok((select not edited and qaza_at is not null from prayer_logs where log_date = '2026-11-10' and prayer = 'asr'),
                'missed -> qaza is not an edit and stores qaza_at');
select tests.eq((set_prayer('2026-11-10', 'asr', 'missed') ->> 'points')::int, 0, 'qaza -> missed is an edit');
select tests.eq((set_prayer('2026-11-10', 'asr', 'qaza') ->> 'points')::int, 0, 'qaza cannot be earned twice');
select tests.eq((set_prayer('2026-11-11', 'maghrib', 'qaza') ->> 'points')::int, 2, 'none -> qaza = 2');
select tests.eq((set_prayer('2026-11-05', 'isha', 'missed') ->> 'points')::int, 0, 'old missed = 0');
select tests.eq((set_prayer('2026-11-05', 'isha', 'qaza') ->> 'points')::int, 0, 'qaza for an old day = 0 pts (record only)');
select tests.ok((select not edited from prayer_logs where log_date = '2026-11-05' and prayer = 'isha'), 'old qaza still not an edit');

-- direct writes are impossible
select tests.throws($q$ insert into prayer_logs (user_id, log_date, prayer, status, eligible, points)
                       values (auth.uid(), '2026-11-11', 'asr', 'jamaat', true, 10) $q$,
                    'permission denied', 'direct INSERT denied');
select tests.throws($q$ update prayer_logs set points = 10 $q$, 'permission denied', 'direct UPDATE denied');
select tests.throws($q$ delete from prayer_logs $q$, 'permission denied', 'direct DELETE denied');
select tests.throws($q$ insert into zikr_logs values (auth.uid(), '2026-11-11', 'morning', true, true, false) $q$,
                    'permission denied', 'direct zikr INSERT denied');
select tests.throws($q$ update profiles set name = 'x' $q$, 'permission denied', 'direct profile UPDATE denied');
select tests.throws($q$ select app_private.points_between(auth.uid(), '2000-01-01', '2999-01-01') $q$,
                    'permission denied', 'private helpers cannot be called by clients');
select tests.throws($q$ select app_private.now() $q$, 'permission denied', 'clients cannot call or see the clock helper');

-- day bonuses: full day + both azkar on 10 Nov (yesterday, inside window)
select set_prayer('2026-11-10', p, 'jamaat') from unnest(array['fajr','dhuhr','maghrib','isha']) p;
-- asr on 10 Nov is edited (0 pts), so no full-day bonus for 10 Nov
select set_zikr('2026-11-10', 'morning', true);
select set_zikr('2026-11-10', 'evening', true);
-- full clean day on 9 Nov
select set_prayer('2026-11-09', p, 'jamaat') from unnest(array['fajr','asr','maghrib','isha']) p;
-- 9 Nov dhuhr already = alone (4). So 9 Nov = 4*10 + 4 + 5 bonus
-- this week (Mon 9 - Sun 15): 9 Nov 49, 10 Nov 40 + 3, 11 Nov: dhuhr 4 + maghrib 2
select tests.eq((select points from get_leaderboard('week') where is_me), 49 + 43 + 6, 'week points = row points + full-day bonus + azkar bonus, edits excluded');
select tests.eq((select points from get_leaderboard('all') where is_me), 98, 'all-time excludes ineligible (old) rows');

-- edited azkar loses the bonus
select set_zikr('2026-11-10', 'evening', false);
select set_zikr('2026-11-10', 'evening', true);
select tests.eq((select points from get_leaderboard('week') where is_me), 95, 'edited azkar = no +3 bonus');
select tests.throws($q$ select set_zikr('2026-11-12', 'morning', true) $q$, 'Future dates', 'future zikr rejected');
select tests.throws($q$ select set_zikr('2026-11-11', 'night', true) $q$, 'Unknown azkar slot', 'invalid slot rejected');

-- streaks: 9 Nov complete; 10 Nov asr edited to qaza? (status qaza -> complete); 11 Nov incomplete
select tests.eq((get_profile_summary() ->> 'streak')::int, 2, 'streak counts back from yesterday when today is not complete');
select set_prayer('2026-11-11', p, 'jamaat') from unnest(array['asr','isha']) p;
select set_prayer('2026-11-11', 'fajr', 'alone');
select tests.eq((get_profile_summary() ->> 'streak')::int, 3, 'completing today extends the streak');
select tests.eq((get_profile_summary() ->> 'today'), '2026-11-11', 'summary reports the server-judged date');

-- quran / nafl validation
select tests.eq((set_quran('2026-11-11', 25) ->> 'pages')::int, 25, 'quran pages saved');
select tests.eq((set_quran('2026-11-11', 7) ->> 'pages')::int, 7, 'quran save sets today''s total');
select tests.throws($q$ select set_quran('2026-11-11', 605) $q$, 'between 0 and 604', 'quran pages > 604 rejected');
select tests.throws($q$ select set_quran('2026-11-12', 5) $q$, 'Future dates', 'future quran rejected');
select tests.eq(get_quran_total(), 7, 'quran total is all-time sum');
select tests.eq((set_nafl('2026-11-11', 'ramadan:taraweeh', true, 8) ->> 'value')::int, 8, 'taraweeh stores rakats');
select tests.throws($q$ select set_nafl('2026-11-11', 'ramadan:taraweeh', true, 21) $q$, 'between 0 and 20', 'taraweeh > 20 rejected');
select tests.throws($q$ select set_nafl('2026-11-11', 'duha', true, 3) $q$, 'Only taraweeh', 'value only for taraweeh');
select tests.throws($q$ select set_nafl('2026-11-11', 'dance', true) $q$, 'Unknown item', 'unknown nafl rejected');

reset role;

-- ------------------------------------------- timezone near midnight
-- 18:45 UTC = 00:15 on Thu 12 Nov in India, still 10:45 on Wed 11 Nov in LA
select tests.set_clock('2026-11-11 18:45:00+00');
select tests.login(:'a');
set local role authenticated;
select tests.eq((get_profile_summary() ->> 'today'), '2026-11-12', 'India user: server says it is already 12 Nov');
select tests.eq((set_prayer('2026-11-12', 'fajr', 'jamaat') ->> 'points')::int, 10, 'India user can log 12 Nov just after midnight');
select tests.eq((set_prayer('2026-11-09', 'fajr', 'alone') ->> 'points')::int, 0, '9 Nov already outside the window for India user (edit anyway)');
select tests.eq((set_prayer('2026-11-09', 'dhuhr', 'missed') ->> 'edited')::boolean, true, 'edit of an old day stays an edit');
reset role;

select tests.login(:'b');
set local role authenticated;
select tests.eq((get_profile_summary() ->> 'today'), '2026-11-11', 'LA user: still 11 Nov');
select tests.throws($q$ select set_prayer('2026-11-12', 'fajr', 'jamaat') $q$, 'Future dates', 'LA user cannot log 12 Nov yet');
select tests.eq((set_prayer('2026-11-09', 'fajr', 'jamaat') ->> 'points')::int, 10, 'LA user: 9 Nov still inside the window');
reset role;

-- ------------------------------------------- month / year boundary
select tests.set_clock('2027-01-01 06:00:00+00');  -- 11:30 on 1 Jan in India
select tests.login(:'a');
set local role authenticated;
select tests.eq((set_prayer('2026-12-30', 'isha', 'jamaat') ->> 'points')::int, 10, '30 Dec counts on 1 Jan (window crosses the year)');
select tests.eq((set_prayer('2026-12-29', 'isha', 'jamaat') ->> 'points')::int, 0, '29 Dec does not');
select tests.eq((select points from get_leaderboard('month') where is_me), 0, 'January month view does not include December points');
reset role;

-- anon can do nothing
select tests.login(null);
set local role anon;
select tests.throws($q$ select * from prayer_logs $q$, 'permission denied', 'anon cannot read logs');
select tests.throws($q$ select set_prayer('2026-11-11', 'fajr', 'jamaat') $q$, 'permission denied', 'anon cannot call RPCs');
reset role;

rollback;
