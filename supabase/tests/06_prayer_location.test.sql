-- Prayer location & calculation settings
\set ON_ERROR_STOP 1
\set QUIET 1
begin;
\ir _helpers.sql

select tests.set_clock('2026-11-15 12:00:00+00');
select tests.new_user('pl_user1@test.dev', 'Prayer User One', 'Asia/Kolkata') as u1 \gset
select tests.new_user('pl_user2@test.dev', 'Prayer User Two', 'Asia/Kolkata') as u2 \gset

-- -----------------------------------------------------------------------------
-- 1. Valid new keys accepted & saved
-- -----------------------------------------------------------------------------
select tests.login(:'u1');
set local role authenticated;

select update_settings('{
  "lat": 19.076,
  "lng": 72.877,
  "locationLabel": "Mumbai, Maharashtra, India",
  "method": "karachi",
  "madhab": "hanafi",
  "highLat": "middleofthenight",
  "ishaEnd": "midnight"
}') as res \gset

select tests.eq((:'res'::jsonb -> 'settings' ->> 'lat')::numeric, 19.08::numeric, 'lat rounded to 2 decimals');
select tests.eq((:'res'::jsonb -> 'settings' ->> 'lng')::numeric, 72.88::numeric, 'lng rounded to 2 decimals');
select tests.eq((:'res'::jsonb -> 'settings' ->> 'locationLabel')::text, 'Mumbai, Maharashtra, India'::text, 'locationLabel saved');
select tests.eq((:'res'::jsonb -> 'settings' ->> 'method')::text, 'karachi'::text, 'method saved');
select tests.eq((:'res'::jsonb -> 'settings' ->> 'madhab')::text, 'hanafi'::text, 'madhab saved');
select tests.eq((:'res'::jsonb -> 'settings' ->> 'highLat')::text, 'middleofthenight'::text, 'highLat saved');
select tests.eq((:'res'::jsonb -> 'settings' ->> 'ishaEnd')::text, 'midnight'::text, 'ishaEnd saved');

-- Shafi madhab and fajr ishaEnd accepted
select update_settings('{"madhab": "shafi", "ishaEnd": "fajr"}') as res2 \gset
select tests.eq((:'res2'::jsonb -> 'settings' ->> 'madhab')::text, 'shafi'::text, 'shafi madhab saved');
select tests.eq((:'res2'::jsonb -> 'settings' ->> 'ishaEnd')::text, 'fajr'::text, 'fajr ishaEnd saved');

-- Null / clearing coordinates accepted
select update_settings('{"lat": null, "lng": null, "locationLabel": null}') as res_clear \gset
select tests.ok((:'res_clear'::jsonb -> 'settings' ->> 'lat') is null, 'lat cleared to null');
select tests.ok((:'res_clear'::jsonb -> 'settings' ->> 'lng') is null, 'lng cleared to null');
select tests.ok((:'res_clear'::jsonb -> 'settings' ->> 'locationLabel') is null, 'locationLabel cleared to null');

-- -----------------------------------------------------------------------------
-- 2. Out-of-range / invalid values rejected
-- -----------------------------------------------------------------------------
select tests.throws($q$ select update_settings('{"lat": 95.0}') $q$, 'lat must be between -90 and 90', 'lat > 90 rejected');
select tests.throws($q$ select update_settings('{"lat": -95.0}') $q$, 'lat must be between -90 and 90', 'lat < -90 rejected');
select tests.throws($q$ select update_settings('{"lng": 185.0}') $q$, 'lng must be between -180 and 180', 'lng > 180 rejected');
select tests.throws($q$ select update_settings('{"lng": -185.0}') $q$, 'lng must be between -180 and 180', 'lng < -180 rejected');

select tests.throws(
  $q$ select update_settings('{"locationLabel": "This label is way too long and definitely exceeds the maximum allowed length of eighty characters limit by far"}') $q$,
  'must be at most 80 characters',
  'locationLabel > 80 chars rejected'
);

select tests.throws($q$ select update_settings('{"method": "unknown_method"}') $q$, 'Method must be one of', 'unknown method string rejected');
select tests.throws($q$ select update_settings('{"method": 9}') $q$, 'Method must be', 'out of range method number rejected');
select tests.throws($q$ select update_settings('{"madhab": "maliki_standalone"}') $q$, 'madhab must be hanafi or shafi', 'invalid madhab rejected');
select tests.throws($q$ select update_settings('{"highLat": "invalid_rule"}') $q$, 'highLat must be', 'invalid highLat rejected');
select tests.throws($q$ select update_settings('{"ishaEnd": "sunrise"}') $q$, 'ishaEnd must be midnight or fajr', 'invalid ishaEnd rejected');

-- -----------------------------------------------------------------------------
-- 3. Old keys still work seamlessly
-- -----------------------------------------------------------------------------
select update_settings('{
  "city": "Hyderabad",
  "country": "India",
  "method": 2,
  "asr": "hanafi",
  "name": "Prayer User Renamed",
  "timezone": "Asia/Kolkata",
  "azanAlert": true,
  "smartFix": false
}') as res_old \gset

select tests.eq((:'res_old'::jsonb -> 'settings' ->> 'city')::text, 'Hyderabad'::text, 'old city key works');
select tests.eq((:'res_old'::jsonb -> 'settings' ->> 'country')::text, 'India'::text, 'old country key works');
select tests.eq((:'res_old'::jsonb -> 'settings' ->> 'method')::text, '2'::text, 'numeric method 2 works');
select tests.eq((:'res_old'::jsonb -> 'settings' ->> 'asr')::text, 'hanafi'::text, 'old asr key works');
select tests.eq((:'res_old'::jsonb ->> 'name')::text, 'Prayer User Renamed'::text, 'name update works');

-- -----------------------------------------------------------------------------
-- 4. export_my_data includes prayer location
-- -----------------------------------------------------------------------------
select update_settings('{"lat": 17.38, "lng": 78.48, "locationLabel": "Hyderabad, India"}');

select export_my_data() as exp \gset
select tests.eq((:'exp'::jsonb -> 'prayerLocation' ->> 'lat')::numeric, 17.38::numeric, 'export_my_data includes lat');
select tests.eq((:'exp'::jsonb -> 'prayerLocation' ->> 'lng')::numeric, 78.48::numeric, 'export_my_data includes lng');
select tests.eq((:'exp'::jsonb -> 'prayerLocation' ->> 'label')::text, 'Hyderabad, India'::text, 'export_my_data includes label');

-- -----------------------------------------------------------------------------
-- 5. Location not visible to other users (leaderboard privacy)
-- -----------------------------------------------------------------------------
reset role;
select tests.login(:'u2');
set local role authenticated;

-- User 2 cannot see User 1's profile row or settings directly (RLS filters out other profiles)
select tests.eq((select count(*) from public.profiles where id = :'u1')::int, 0, 'User 2 cannot read User 1 profile row');
select tests.eq((select count(*) from public.profiles)::int, 1, 'User 2 sees only their own profile');
select tests.ok((select settings from public.profiles where id = :'u1') is null, 'direct read of another profile returns null');
select tests.throws($q$ update public.profiles set settings = '{}' where id = :'u1' $q$, 'permission denied', 'direct profile update denied');

rollback;
