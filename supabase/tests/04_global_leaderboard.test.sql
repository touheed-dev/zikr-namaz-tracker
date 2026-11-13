-- Global Leaderboard, usernames, add-friend-by-tap and blocks
\set ON_ERROR_STOP 1
\set QUIET 1
begin;
\ir _helpers.sql

select tests.set_clock('2026-11-13 12:00:00+00');
select tests.new_user('u1@test.dev', 'User One', 'Asia/Kolkata') as u1 \gset
select tests.new_user('u2@test.dev', 'User Two', 'Asia/Kolkata') as u2 \gset
select tests.new_user('u3@test.dev', 'User Three', 'Asia/Kolkata') as u3 \gset

-- -----------------------------------------------------------------------------
-- 1. Username validation, regex, reserved names, case-insensitive uniqueness
-- -----------------------------------------------------------------------------
select tests.login(:'u1');
set local role authenticated;

select tests.throws($q$ select set_username('ab') $q$, 'Username must be 3-20 characters', 'username too short rejected');
select tests.throws($q$ select set_username('1abc') $q$, 'Username must be 3-20 characters', 'must start with a letter');
select tests.throws($q$ select set_username('user name') $q$, 'Username must be 3-20 characters', 'spaces rejected');
select tests.throws($q$ select set_username('user@name') $q$, 'Username must be 3-20 characters', 'special chars rejected');
select tests.throws($q$ select set_username('admin') $q$, 'reserved', 'reserved username "admin" rejected');
select tests.throws($q$ select set_username('support') $q$, 'reserved', 'reserved username "support" rejected');

select tests.eq((set_username('user_one') ->> 'username'), 'user_one', 'valid username set');
reset role;

-- Case-insensitive uniqueness check with user 2
select tests.login(:'u2');
set local role authenticated;
select tests.throws($q$ select set_username('USER_ONE') $q$, 'taken', 'duplicate username (case-insensitive) rejected');
select tests.eq((set_username('user_two') ->> 'username'), 'user_two', 'user two sets username');
reset role;

-- -----------------------------------------------------------------------------
-- 2. showOnGlobal requires a username first
-- -----------------------------------------------------------------------------
select tests.login(:'u3');
set local role authenticated;
select tests.throws($q$ select update_settings('{"showOnGlobal": true}') $q$, 'Choose a username first',
                    'showOnGlobal without username rejected');
select set_username('user_three');
select tests.ok((update_settings('{"showOnGlobal": true}') -> 'settings' ->> 'showOnGlobal')::boolean,
                'showOnGlobal allowed after setting username');
reset role;

-- -----------------------------------------------------------------------------
-- 3. Opt-in & Active rules for global leaderboard
-- Active = has any prayer_logs row in the last 7 days of their own user_today().
-- -----------------------------------------------------------------------------
-- Currently:
-- u1: username='user_one', showOnGlobal=false (default), no logs -> not listed
-- u2: username='user_two', showOnGlobal=false, no logs -> not listed
-- u3: username='user_three', showOnGlobal=true, but no logs (inactive) -> not listed

select tests.login(:'u1');
set local role authenticated;
select tests.eq(jsonb_array_length((get_global_leaderboard('week') -> 'rows')), 0,
                'no active opted-in users initially');
select tests.eq(((get_global_leaderboard('week') -> 'me' ->> 'optedIn')::boolean), false,
                'u1 optedIn is false');
select tests.ok((get_global_leaderboard('week') -> 'me' -> 'rank') is null or (get_global_leaderboard('week') -> 'me' ->> 'rank') is null,
                'u1 rank is null when not opted in');
reset role;

-- Make u3 active by logging a prayer today
select tests.login(:'u3');
set local role authenticated;
select set_prayer('2026-11-13', 'fajr', 'jamaat');
reset role;

-- Now u3 is opted-in and active
select tests.login(:'u1');
set local role authenticated;
select tests.eq(jsonb_array_length((get_global_leaderboard('week') -> 'rows')), 1,
                'u3 appears now that they are opted-in and active');
select tests.eq((get_global_leaderboard('week') -> 'rows' -> 0 ->> 'username'), 'user_three',
                'u3 username is correct in list');
-- Verify no email or real name in output
select tests.ok((get_global_leaderboard('week')::text not like '%@test.dev%') and (get_global_leaderboard('week')::text not like '%User Three%'),
                'global leaderboard contains no email and no real names');
reset role;

-- Test inactive user with old log (> 7 days ago)
select tests.login(:'u2');
set local role authenticated;
select update_settings('{"showOnGlobal": true}');
-- Log older than 7 days (today is 2026-11-13, 8 days ago is 2026-11-05)
select set_prayer('2026-11-05', 'fajr', 'jamaat');
reset role;

select tests.login(:'u1');
set local role authenticated;
select tests.eq(jsonb_array_length((get_global_leaderboard('week') -> 'rows')), 1,
                'user with only >7-day-old logs is not active and not listed');
reset role;

-- Make u2 active with a log 5 days ago (2026-11-08)
select tests.login(:'u2');
set local role authenticated;
select set_prayer('2026-11-08', 'fajr', 'jamaat');
reset role;

select tests.login(:'u1');
set local role authenticated;
select tests.eq(jsonb_array_length((get_global_leaderboard('week') -> 'rows')), 2,
                'user with log within 7 days is active and listed');
reset role;

-- -----------------------------------------------------------------------------
-- 4. send_friend_request_to_user and via = 'global'
-- -----------------------------------------------------------------------------
select tests.login(:'u1');
set local role authenticated;
-- u1 tries to request u1 (self)
select tests.throws(format('select send_friend_request_to_user(%L)', :'u1'), 'Invalid', 'self request rejected');
-- u1 tries to request a non-opted-in user (create u4 not opted in)
reset role;
select tests.new_user('u4@test.dev', 'User Four', 'Asia/Kolkata') as u4 \gset
-- Sender with no username rejected
select tests.login(:'u4');
set local role authenticated;
select tests.throws(format('select send_friend_request_to_user(%L)', :'u3'), 'Choose a username first',
                    'sender with no username gets Choose a username first');
reset role;

select tests.login(:'u1');
set local role authenticated;
select tests.throws(format('select send_friend_request_to_user(%L)', :'u4'), 'not on the global leaderboard',
                    'request to non-opted-in user rejected');

-- u1 requests u3 by ID
select tests.ok((send_friend_request_to_user(:'u3') ->> 'ok')::boolean, 'request to u3 succeeds');
-- Check outgoing request has via = 'global', target username, and email null
select tests.eq((list_friend_requests() -> 'outgoing' -> 0 ->> 'via'), 'global', 'outgoing request marked via global');
select tests.eq((list_friend_requests() -> 'outgoing' -> 0 ->> 'username'), 'user_three', 'outgoing request shows target username');
select tests.ok((list_friend_requests() -> 'outgoing' -> 0 -> 'email') is null or (list_friend_requests() -> 'outgoing' -> 0 ->> 'email') is null,
                'outgoing request has email null');
-- Neither list_friend_requests nor export_my_data contains target B's email
select tests.ok(list_friend_requests()::text not like '%u3@test.dev%',
                'A list_friend_requests does not contain B email');
select tests.ok(export_my_data()::text not like '%u3@test.dev%',
                'A export_my_data does not contain B email');
reset role;

-- Check u3's incoming request shows username and email null
select tests.login(:'u3');
set local role authenticated;
select tests.eq((list_friend_requests() -> 'incoming' -> 0 ->> 'name'), 'user_one', 'incoming shows username');
select tests.ok((list_friend_requests() -> 'incoming' -> 0 -> 'email') is null or (list_friend_requests() -> 'incoming' -> 0 ->> 'email') is null,
                'incoming has email null');
select tests.eq((list_friend_requests() -> 'incoming' -> 0 ->> 'via'), 'global', 'incoming has via global');
reset role;

-- -----------------------------------------------------------------------------
-- 5. Blocking: block_user, unblock_user, list_blocked
-- -----------------------------------------------------------------------------
-- u3 blocks u1
select tests.login(:'u3');
set local role authenticated;
select tests.ok((block_user(:'u1') ->> 'ok')::boolean, 'u3 blocks u1');
select tests.eq(jsonb_array_length(list_blocked()), 1, 'blocked list has 1 entry');
select tests.eq((list_blocked() -> 0 ->> 'username'), 'user_one', 'blocked list shows username');
-- Block should delete pending requests in both directions
select tests.eq(jsonb_array_length(list_friend_requests() -> 'incoming'), 0, 'block deleted pending incoming request');
reset role;

select tests.login(:'u1');
set local role authenticated;
select tests.eq(jsonb_array_length(list_friend_requests() -> 'outgoing'), 0, 'block deleted pending outgoing request for u1');

-- u1 tries to request u3 again while blocked: returns generic ok but creates no row
select tests.ok((send_friend_request_to_user(:'u3') ->> 'ok')::boolean, 'request to blocker returns generic ok');
select tests.eq(jsonb_array_length(list_friend_requests() -> 'outgoing'), 0, 'no request created when target blocked requester');
reset role;

-- Unblock
select tests.login(:'u3');
set local role authenticated;
select tests.ok((unblock_user(:'u1') ->> 'ok')::boolean, 'u3 unblocks u1');
select tests.eq(jsonb_array_length(list_blocked()), 0, 'blocked list empty after unblock');
reset role;

-- -----------------------------------------------------------------------------
-- 6. Cap at 50 & me.rank
-- -----------------------------------------------------------------------------
-- Enable showOnGlobal on u1, make u1 active with 20 points
select tests.login(:'u1');
set local role authenticated;
select update_settings('{"showOnGlobal": true}');
select set_prayer('2026-11-13', 'fajr', 'jamaat');
select set_prayer('2026-11-13', 'dhuhr', 'jamaat');
reset role;

-- Insert 55 active opted-in users
do $$
declare
  v_new_id uuid;
  i int;
begin
  for i in 1..55 loop
    v_new_id := gen_random_uuid();
    insert into auth.users (id, email) values (v_new_id, 'bot' || i || '@test.dev');
    insert into public.profiles (id, name, username, settings)
    values (v_new_id, 'Bot ' || i, 'bot_user_' || i,
            jsonb_build_object('showOnGlobal', true, 'shareStats', true));
    insert into public.prayer_logs (user_id, log_date, prayer, status, eligible, points)
    values (v_new_id, '2026-11-13', 'fajr', 'alone', true, 4);
  end loop;
end $$;

select tests.login(:'u1');
set local role authenticated;
select tests.eq(jsonb_array_length(get_global_leaderboard('week') -> 'rows'), 50,
                'global leaderboard is capped at 50');
select tests.eq(((get_global_leaderboard('week') -> 'me' ->> 'rank')::int), 1,
                'u1 has rank 1 with 20 points');
select tests.eq(((get_global_leaderboard('week') -> 'me' ->> 'optedIn')::boolean), true,
                'u1 optedIn is true');
reset role;

-- -----------------------------------------------------------------------------
-- 7. Direct writes on friend_blocks and profiles.username denied
-- -----------------------------------------------------------------------------
select tests.login(:'u1');
set local role authenticated;
select tests.throws(format('insert into friend_blocks (blocker, blocked) values (auth.uid(), %L)', :'u2'),
                    'permission denied', 'direct insert on friend_blocks denied');
select tests.throws('update profiles set username = ''hacked'' where id = auth.uid()',
                    'permission denied', 'direct update on profiles.username denied');
reset role;

-- anon cannot execute get_global_leaderboard
select tests.login(null);
set local role anon;
select tests.throws($q$ select get_global_leaderboard('week') $q$,
                    'permission denied', 'anon cannot execute get_global_leaderboard');
reset role;

rollback;

