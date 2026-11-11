-- Privacy (A vs B vs stranger C), friend requests without account
-- enumeration, share settings, and settings whitelist.
\set ON_ERROR_STOP 1
\set QUIET 1
begin;
\ir _helpers.sql

select tests.set_clock('2026-11-11 12:00:00+00');
select tests.new_user('a@test.dev', 'Ayaan', 'Asia/Kolkata') as a \gset
select tests.new_user('b@test.dev', 'Bilal', 'Asia/Kolkata') as b \gset
select tests.new_user('c@test.dev', 'Chand', 'Asia/Kolkata') as c \gset

-- A logs everything, including private items
select tests.login(:'a');
set local role authenticated;
select set_prayer('2026-11-11', p, 'jamaat') from unnest(array['fajr','dhuhr','asr','maghrib','isha']) p;
select set_zikr('2026-11-11', 'morning', true);
select set_quran('2026-11-11', 20);
select set_quran('2026-11-10', 5);
select set_nafl('2026-11-11', 'tahajjud', true);
select set_nafl('2026-11-11', 'ramadan:roza', true);
reset role;

-- --------------------------------------------- B before friendship
select tests.login(:'b');
set local role authenticated;
select tests.eq((select count(*) from prayer_logs)::int, 0, 'B cannot read A''s prayer rows');
select tests.eq((select count(*) from nafl_logs)::int, 0, 'B cannot read A''s nafl or Ramadan rows');
select tests.eq((select count(*) from quran_logs)::int, 0, 'B cannot read A''s quran rows');
select tests.eq((select count(*) from zikr_logs)::int, 0, 'B cannot read A''s zikr rows');
select tests.eq((select count(*) from profiles)::int, 1, 'B sees only his own profile');
select tests.ok(friend_heatmap(:'a') is null, 'non-friend gets no heatmap');
select tests.ok(friend_quran_streak(:'a') is null, 'non-friend gets no quran streak');
select tests.eq(jsonb_array_length(friend_badges(:'a')), 0, 'non-friend gets no badges');
select tests.eq((select count(*) from get_leaderboard('week'))::int, 1, 'leaderboard = only me before friends');

-- requests: identical answers for real and unknown emails
select send_friend_request('A@Test.dev ') as r1 \gset
select send_friend_request('nobody@nowhere.dev') as r2 \gset
select tests.eq(:'r1'::jsonb, :'r2'::jsonb, 'existing and unknown email get the identical response');
select tests.eq((:'r1'::jsonb ->> 'message'), 'If that person has an account, they will get your request.', 'generic message text');
select tests.eq(jsonb_array_length(list_friend_requests() -> 'outgoing'), 2, 'outgoing lists both, indistinguishable');
select send_friend_request('a@test.dev');
select tests.eq(jsonb_array_length(list_friend_requests() -> 'outgoing'), 2, 'duplicate request ignored');
select tests.throws($q$ select send_friend_request('B@test.dev') $q$, 'cannot invite yourself', 'self invite rejected');
select tests.throws($q$ select send_friend_request('not-an-email') $q$, 'valid email', 'malformed email rejected');
select tests.throws($q$ insert into friend_requests (requester, email) values (auth.uid(), 'x@y.z') $q$, 'permission denied', 'direct request insert denied');
select tests.throws($q$ insert into friendships (requester, addressee) values (auth.uid(), auth.uid()) $q$, 'permission denied', 'direct friendship insert denied');
reset role;

-- --------------------------------------------- stranger C cannot accept B's request to A
select tests.login(:'c');
set local role authenticated;
select (list_friend_requests()) as creq \gset
select tests.eq(jsonb_array_length(:'creq'::jsonb -> 'incoming'), 0, 'C sees no incoming requests');
select tests.throws(format('select accept_friend_request(%L)',
                           (select id from public.friend_requests limit 1)), 'not found',
                    'C cannot accept a request addressed to someone else');
reset role;

-- --------------------------------------------- A accepts
select tests.login(:'a');
set local role authenticated;
select (list_friend_requests() -> 'incoming' -> 0) as inc \gset
select tests.eq((:'inc'::jsonb ->> 'name'), 'Bilal', 'A sees B''s incoming request with name');
select tests.ok((accept_friend_request((:'inc'::jsonb ->> 'id')::uuid) ->> 'ok')::boolean, 'A accepts');
select tests.eq((select count(*) from get_leaderboard('week'))::int, 2, 'A now sees B on the leaderboard');
select tests.eq(jsonb_array_length(list_friend_requests() -> 'incoming'), 0, 'accepted request disappears');
reset role;

select tests.login(:'b');
set local role authenticated;
select tests.eq((select count(*) from get_leaderboard('week'))::int, 2, 'B sees A on the leaderboard');
select tests.eq((select name from get_leaderboard('week') order by points desc limit 1), 'Ayaan', 'leaderboard sorted by points (A 50+5 first)');
select tests.eq((select points from get_leaderboard('week') where not is_me), 55, 'friend points visible');
select tests.eq((select streak from get_leaderboard('week') where not is_me), 1, 'friend streak visible');
select tests.eq(jsonb_array_length(list_friend_requests() -> 'outgoing'), 1, 'outgoing to A cleared, unknown remains');
-- friendship does NOT open raw rows
select tests.eq((select count(*) from prayer_logs)::int, 0, 'friend still cannot read raw prayer rows');
select tests.eq((select count(*) from nafl_logs)::int, 0, 'friend never reads nafl/Ramadan rows');
select tests.ok(friend_heatmap(:'a') is null, 'heatmap hidden until A turns shareHeatmap on');
select tests.ok(friend_quran_streak(:'a') is null, 'quran streak hidden until A turns shareQuran on');
-- the weekly report RPC has no user argument: B only ever gets B's report
select tests.eq((weekly_report(0) ->> 'hasData')::boolean, false, 'B''s report contains none of A''s data');
select tests.eq((select count(*) from pg_proc where proname in ('weekly_report','list_badges','export_my_data')
                  and pronamespace = 'public'::regnamespace and 'uuid'::regtype = any (proargtypes::regtype[]))::int,
                0, 'report / badges / export take no user id');
reset role;

-- --------------------------------------------- A opens sharing
select tests.login(:'a');
set local role authenticated;
select tests.ok((update_settings('{"shareHeatmap": true, "shareQuran": true}') -> 'settings' ->> 'shareHeatmap')::boolean,
                'A turns sharing on');
reset role;

select tests.login(:'b');
set local role authenticated;
select tests.eq(jsonb_array_length(friend_heatmap(:'a')), 5, 'B now sees A''s namaz heatmap (5 cells)');
select tests.ok(friend_heatmap(:'a')::text not like '%tahajjud%' and friend_heatmap(:'a')::text not like '%ramadan%',
                'heatmap never contains nafl or Ramadan items');
select tests.eq(friend_quran_streak(:'a'), 2, 'B now sees A''s quran streak');
reset role;

-- --------------------------------------------- stranger C still sees nothing
select tests.login(:'c');
set local role authenticated;
select tests.ok(friend_heatmap(:'a') is null, 'stranger gets no heatmap even when A shares');
select tests.ok(friend_quran_streak(:'a') is null, 'stranger gets no quran streak');
select tests.eq((select count(*) from get_leaderboard('all'))::int, 1, 'stranger leaderboard = only self');
select tests.eq((select count(*) from friendships)::int, 0, 'stranger cannot see A-B friendship');
select tests.eq((select count(*) from friend_requests)::int, 0, 'stranger cannot see others'' requests');
select remove_friend(:'a');
reset role;
select tests.eq((select count(*) from friendships
                 where least(requester, addressee) = least(:'a'::uuid, :'b'::uuid)
                   and greatest(requester, addressee) = greatest(:'a'::uuid, :'b'::uuid))::int,
                1, 'stranger remove_friend has no effect');

-- --------------------------------------------- shareStats off hides A from B's leaderboard
select tests.login(:'a');
set local role authenticated;
select update_settings('{"shareStats": false}');
select tests.eq((select count(*) from get_leaderboard('week'))::int, 2, 'A still sees B');
reset role;
select tests.login(:'b');
set local role authenticated;
select tests.eq((select count(*) from get_leaderboard('week'))::int, 1, 'A hidden from B when shareStats is off');
reset role;

-- --------------------------------------------- settings whitelist
select tests.login(:'a');
set local role authenticated;
select tests.throws($q$ select update_settings('{"isAdmin": true}') $q$, 'Unknown setting', 'unknown key rejected');
select tests.throws($q$ select update_settings('{"method": 9}') $q$, 'Method must be', 'method out of range rejected');
select tests.throws($q$ select update_settings('{"shareQuran": "yes"}') $q$, 'true or false', 'wrong type rejected');
select tests.throws($q$ select update_settings('{"timezone": "Not/AZone"}') $q$, 'Unknown timezone', 'invalid timezone rejected');
select tests.throws($q$ select update_settings('{"smartFixChoice": "pray"}') $q$, 'smartFixChoice', 'invalid smartFixChoice rejected');
select tests.throws($q$ select update_settings('[1,2]') $q$, 'must be an object', 'non-object patch rejected');
select update_settings('{"city": "Hyderabad", "method": 2, "asr": "hanafi", "smartFixChoice": "buddy", "name": "Ayaan K", "timezone": "Europe/London"}') as me \gset
select tests.eq((:'me'::jsonb -> 'settings' ->> 'city'), 'Hyderabad', 'city saved');
select tests.eq((:'me'::jsonb -> 'settings' ->> 'method')::int, 2, 'method saved');
select tests.eq((:'me'::jsonb ->> 'name'), 'Ayaan K', 'name saved');
select tests.eq((:'me'::jsonb ->> 'timezone'), 'Europe/London', 'timezone saved');
select tests.eq((:'me'::jsonb -> 'settings' ->> 'showHadith')::boolean, true, 'defaults are merged in');
select tests.eq((:'me'::jsonb ->> 'email'), 'a@test.dev', 'get_me shape includes email');
reset role;

-- --------------------------------------------- unfriend
select tests.login(:'b');
set local role authenticated;
select remove_friend(:'a');
select tests.eq((select count(*) from friendships)::int, 0, 'B removes A');
select tests.ok(friend_heatmap(:'a') is null, 'after unfriending, sharing stops');
-- inviting back after A invited B accepts directly
reset role;
select tests.login(:'a');
set local role authenticated;
select send_friend_request('b@test.dev');
reset role;
select tests.login(:'b');
set local role authenticated;
select tests.eq((send_friend_request('a@test.dev') ->> 'message'), 'You are now friends.', 'mutual invite = friends');
select tests.eq((select count(*) from friendships)::int, 1, 'one friendship row for the pair');
reset role;

rollback;
