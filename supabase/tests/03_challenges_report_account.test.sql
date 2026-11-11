-- Challenges (progress from logs, one-time rewards, no reward inflation),
-- badges, weekly report rules, export and delete-account cascade.
\set ON_ERROR_STOP 1
\set QUIET 1
begin;
\ir _helpers.sql

select tests.set_clock('2026-11-02 06:00:00+00');  -- Mon 2 Nov, 11:30 India
select tests.new_user('a@test.dev', 'Ayaan', 'Asia/Kolkata') as a \gset
select tests.new_user('b@test.dev', 'Bilal', 'Asia/Kolkata') as b \gset
select tests.new_user('s@test.dev', 'Sana',  'Asia/Kolkata') as s \gset
insert into friendships (requester, addressee) values (:'a', :'b');

-- ------------------------------------------------ create
select tests.login(:'a');
set local role authenticated;
-- days before the challenge starts never count
select set_prayer('2026-11-01', 'fajr', 'jamaat');
select create_challenge(jsonb_build_object('type', 'friend', 'template', 'fajr7', 'reward', 5000,
                                           'invites', jsonb_build_array(:'b', :'s'))) as ch \gset
select tests.eq((:'ch'::jsonb ->> 'reward')::int, 50, 'client cannot inflate reward (server sets 50)');
select tests.eq((:'ch'::jsonb ->> 'progress')::int, 0, 'yesterday does not count: challenge starts at creation');
select tests.eq(jsonb_array_length(:'ch'::jsonb -> 'members'), 2, 'non-friend Sana silently dropped from invites');
select tests.throws($q$ select create_challenge('{"type":"friend","template":"fajr7"}') $q$, 'already have an active',
                    'cannot open a second fajr7 challenge at once');
select tests.throws($q$ select create_challenge('{"type":"friend","template":"gold"}') $q$, 'Unknown challenge template', 'unknown template rejected');
select tests.throws($q$ select create_challenge('{"type":"personal","kind":"quran","target":7}') $q$, 'Pages per day', 'quran goal needs pages');
select tests.throws($q$ select create_challenge('{"type":"personal","kind":"namaz","target":400}') $q$, 'between 1 and 365', 'target bounded');
select tests.throws($q$ insert into challenges (owner_id, type, kind, target, title, starts_on) values (auth.uid(), 'personal', 'namaz', 1, 'x', now()) $q$,
                    'permission denied', 'direct challenge insert denied');
select create_challenge('{"type":"personal","kind":"jamaat","prayer":"isha","target":3}') as pc \gset
select tests.eq((:'pc'::jsonb ->> 'title'), 'Isha in Jamaat, 3 days', 'personal title generated');
select tests.eq((:'pc'::jsonb ->> 'reward')::int, 0, 'personal challenges never carry points');
select tests.eq(jsonb_array_length(list_challenges('personal')), 1, 'personal list');
reset role;

select tests.login(:'s');
set local role authenticated;
select tests.eq(jsonb_array_length(list_challenges('friend')), 0, 'stranger cannot see the challenge');
select tests.eq((select count(*) from challenges)::int, 0, 'stranger cannot select challenge rows');
reset role;

select tests.login(:'b');
set local role authenticated;
select tests.eq((list_challenges('friend') -> 0 ->> 'myStatus'), 'invited', 'B sees the invitation');
select respond_challenge((:'ch'::jsonb ->> 'id')::uuid, true);
select tests.eq((list_challenges('friend') -> 0 ->> 'myStatus'), 'accepted', 'B accepted');
reset role;

-- ------------------------------------------------ 7 days, both pray Fajr in Jamaat
-- day 4: B logs late (outside window) -> that day does not count for the group
do $$
declare i int;
begin
  for i in 0..7 loop
    perform tests.set_clock(timestamptz '2026-11-02 06:00:00+00' + make_interval(days => i));
    perform tests.login((select id from auth.users where email = 'a@test.dev'));
    set local role authenticated;
    perform set_prayer(date '2026-11-02' + i, 'fajr', 'jamaat');
    perform set_prayer(date '2026-11-02' + i, 'isha', 'jamaat');
    reset role;
    if i <> 3 then
      perform tests.login((select id from auth.users where email = 'b@test.dev'));
      set local role authenticated;
      perform set_prayer(date '2026-11-02' + i, 'fajr', 'jamaat');
      reset role;
    end if;
  end loop;
end $$;
-- now 9 Nov; B back-fills 5 Nov (4 days ago) = record only, does not count for rewards
select tests.login(:'b');
set local role authenticated;
select set_prayer('2026-11-05', 'fajr', 'jamaat');
select tests.eq((list_challenges('friend') -> 0 ->> 'progress')::int, 7, '7 together-days (2-4, 6-9 Nov), late fill ignored');
select tests.eq((list_challenges('friend') -> 0 ->> 'rewardGranted')::boolean, true, 'reward granted on completion');
select tests.eq((select sum(points) from challenge_rewards)::int, 50, 'B got +50 exactly once');
select list_challenges('friend');
select tests.eq((select count(*) from challenge_rewards)::int, 1, 'listing again does not grant again');
select tests.eq((list_challenges('friend') -> 0 -> 'week' -> 0 ->> 'done')::boolean, true, 'week strip marks Monday done');
reset role;
select tests.eq((select count(*) from challenge_rewards where challenge_id = (:'ch'::jsonb ->> 'id')::uuid)::int, 2,
                'both members rewarded');
select tests.login(:'a');
set local role authenticated;
select tests.eq((list_challenges('personal') -> 0 ->> 'progress')::int, 3, 'personal progress computed from logs, capped at target');
select tests.eq((list_challenges('personal') -> 0 ->> 'completed')::boolean, true, 'personal challenge completed');
-- the reward shows up in the all-time leaderboard
select tests.ok((select points from get_leaderboard('week') where is_me) >= 50, 'reward counts in the week it was granted');
reset role;

-- ------------------------------------------------ badges
select tests.login(:'a');
set local role authenticated;
select list_badges() as bdg \gset
select tests.eq(jsonb_array_length(:'bdg'::jsonb), 11, '11 badges');
select tests.eq((select b ->> 'note' from jsonb_array_elements(:'bdg'::jsonb) b where b ->> 'id' = 'fajr_40'),
                '9 / 40 days', 'fajr_40 progress note (1-9 Nov in a row)');
select tests.eq((select b ->> 'visibility' from jsonb_array_elements(:'bdg'::jsonb) b where b ->> 'id' = 'khatam'),
                'private', 'khatam is private');
select set_quran('2026-11-09', 20);
select tests.eq((select (b ->> 'earned')::boolean from jsonb_array_elements(list_badges()) b where b ->> 'id' = 'first_para'),
                true, 'first_para earned at 20 pages');
select tests.eq((select b ->> 'note' from jsonb_array_elements(list_badges()) b where b ->> 'id' = 'khatam'),
                'Para 2 of 30', 'khatam note in paras');
reset role;
-- friends only ever see earned "friends" badges: give A a 7-day streak (2-8 Nov)
update prayer_logs set status = 'jamaat' where user_id = :'a';
insert into prayer_logs (user_id, log_date, prayer, status, eligible, points)
select :'a', d::date, p, 'jamaat', false, 0
from generate_series(date '2026-11-02', date '2026-11-08', interval '1 day') d,
     unnest(array['dhuhr','asr','maghrib']) p
on conflict do nothing;
select set_config('request.jwt.claims', '', true);
select tests.login(:'b');
set local role authenticated;
select tests.eq((select string_agg(b ->> 'id', ',') from jsonb_array_elements(friend_badges(:'a')) b),
                'first_week', 'friend sees earned friends-visible badge only (not first_para)');
reset role;

-- ------------------------------------------------ weekly report
-- Week 2-8 Nov for B: fajr jamaat except Thu 5 (late) ... build a richer week for S
select tests.set_clock('2026-11-10 06:00:00+00');  -- Tue 10 Nov -> last full week = 2..8 Nov
insert into prayer_logs (user_id, log_date, prayer, status, eligible, points)
select :'s', d::date, p,
       case when p = 'fajr' and extract(isodow from d) in (4,5,6) then 'missed'
            when p = 'isha' and extract(isodow from d) = 7 then 'qaza'
            when p = 'asr' and extract(isodow from d) in (1,2) then 'alone'
            else 'jamaat' end, true, 0
from generate_series(date '2026-11-02', date '2026-11-08', interval '1 day') d,
     unnest(array['fajr','dhuhr','asr','maghrib','isha']) p;
insert into prayer_logs (user_id, log_date, prayer, status, eligible, points)
select :'s', d::date, 'maghrib', 'jamaat', true, 0
from generate_series(date '2026-10-26', date '2026-11-01', interval '1 day') d;
insert into zikr_logs (user_id, log_date, slot, done, eligible)
select :'s', d::date, s, not (s = 'evening' and extract(isodow from d) = 3), true
from generate_series(date '2026-11-02', date '2026-11-08', interval '1 day') d, unnest(array['morning','evening']) s;
insert into quran_logs (user_id, log_date, pages) values (:'s','2026-11-02',10),(:'s','2026-11-03',21);
insert into nafl_logs (user_id, log_date, name, done) values (:'s','2026-11-02','duha',true),(:'s','2026-11-03','duha',true),(:'s','2026-11-02','ramadan:roza',true);

select tests.login(:'s');
set local role authenticated;
select weekly_report(0) as wr \gset
select tests.eq((:'wr'::jsonb ->> 'from'), '2026-11-02', 'report covers last full Monday');
select tests.eq((:'wr'::jsonb ->> 'to'), '2026-11-08', '...to Sunday');
-- 35 total - 3 missed fajr - 2 alone asr - 1 qaza isha = 29 jamaat
select tests.eq((:'wr'::jsonb -> 'jamaat' ->> 'done')::int, 29, 'jamaat count');
select tests.eq((:'wr'::jsonb -> 'jamaat' ->> 'prev')::int, 7, 'previous week jamaat');
select tests.eq((:'wr'::jsonb -> 'prayed' ->> 'done')::int, 32, 'prayed = jamaat + alone + qaza');
select tests.eq((:'wr'::jsonb -> 'prayed' ->> 'qaza')::int, 1, 'qaza count');
select tests.eq(jsonb_array_length(:'wr'::jsonb -> 'perDay'), 7, '7 day bars');
select tests.eq((:'wr'::jsonb -> 'perDay' -> 0 ->> 'alone')::int, 1, 'Monday has 1 alone');
select tests.eq((:'wr'::jsonb -> 'weakest' ->> 'prayer'), 'fajr', 'weakest waqt = fajr');
select tests.eq((:'wr'::jsonb -> 'weakest' ->> 'jamaat')::int, 4, 'fajr 4 / 7');
select tests.eq((:'wr'::jsonb -> 'strongest' ->> 'prayer'), 'dhuhr', 'strongest = dhuhr (tie -> earlier waqt)');
select tests.eq((:'wr'::jsonb ->> 'insight'), 'Your missed Fajr prayers were on consecutive days, Thursday to Saturday.',
                'insight: consecutive missed fajr');
select tests.eq((:'wr'::jsonb -> 'smartFix' ->> 'misses')::int, 3, 'smart fix after 3 fajr misses');
select tests.eq((:'wr'::jsonb -> 'nextGoal' ->> 'title'), 'Fajr in Jamaat 5 of 7 days', 'next goal from weakest waqt');
select tests.eq((:'wr'::jsonb -> 'zikr' ->> 'days')::int, 6, 'zikr both on 6 days');
select tests.eq((:'wr'::jsonb -> 'zikr' ->> 'missed'), 'evening', 'evening azkar missed');
select tests.eq((:'wr'::jsonb -> 'quran' ->> 'pages')::int, 31, 'quran pages');
select tests.eq((:'wr'::jsonb -> 'nafl' -> 'items' -> 0 ->> 'days')::int, 2, 'duha 2 days');
select tests.ok((:'wr'::jsonb)::text not like '%roza%', 'Ramadan items not in the nafl summary');
select update_settings('{"smartFix": false}');
select tests.ok((weekly_report(0) -> 'smartFix') = 'null'::jsonb, 'smart fix respects the setting');
select tests.eq((weekly_report(1) ->> 'from'), '2026-10-26', 'weekOffset 1 = the week before');
select tests.eq((weekly_report(1) ->> 'insight'), 'Fajr needs the most care: 0 of 7 in Jamaat.', 'weakest-waqt insight');
select tests.eq((weekly_report(2) ->> 'insight'), null, 'no insight for a week without data');
select tests.eq((weekly_report(2) ->> 'hasData')::boolean, false, 'empty week flagged');
select tests.ok((weekly_report(2) -> 'smartFix') = 'null'::jsonb, 'no smart fix for an empty week');
reset role;

-- ------------------------------------------------ export + delete cascade
select tests.login(:'a');
set local role authenticated;
select export_my_data() as ex \gset
select tests.ok((:'ex'::jsonb ? 'prayerLogs') and (:'ex'::jsonb ? 'naflLogs') and (:'ex'::jsonb ? 'badges'), 'export has all sections');
select tests.ok(jsonb_array_length(:'ex'::jsonb -> 'prayerLogs') > 0, 'export contains my logs');
select tests.ok((:'ex'::jsonb)::text not like '%"user_id"%', 'export strips internal user_id columns');
select send_friend_request('newperson@test.dev');
select tests.throws($q$ select delete_my_account('delete') $q$, 'Type DELETE', 'typed confirmation required');
reset role;
select tests.login(:'b');
set local role authenticated;
select send_friend_request('newperson@test.dev');
reset role;
select tests.login(:'a');
set local role authenticated;
select delete_my_account('DELETE');
reset role;
select tests.eq((select count(*) from auth.users where id = :'a')::int, 0, 'auth user deleted');
select tests.eq((select count(*) from profiles where id = :'a')::int, 0, 'profile cascaded');
select tests.eq(((select count(*) from prayer_logs where user_id = :'a') + (select count(*) from zikr_logs where user_id = :'a')
               + (select count(*) from quran_logs where user_id = :'a') + (select count(*) from nafl_logs where user_id = :'a'))::int,
                0, 'all logs cascaded');
select tests.eq((select count(*) from challenges where owner_id = :'a')::int, 0, 'owned challenges cascaded');
select tests.eq((select count(*) from friendships where :'a' in (requester, addressee))::int, 0, 'friendships cascaded');
select tests.eq((select count(*) from friend_requests where requester = :'a')::int, 0, 'sent requests cascaded');
select tests.eq((select count(*) from friend_requests where email = 'newperson@test.dev')::int, 1, 'other users'' requests untouched');
select tests.eq((select count(*) from challenge_rewards where user_id = :'a')::int, 0, 'rewards cascaded');

rollback;
