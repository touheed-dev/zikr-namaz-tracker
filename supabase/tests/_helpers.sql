-- Shared helpers, created inside each test's transaction (rolled back after).
create schema tests;
grant usage on schema tests to authenticated, anon;

create function tests.ok(cond boolean, label text)
returns void language plpgsql as $$
begin
  if cond is not true then
    raise exception 'FAIL: %', label;
  end if;
  raise notice 'ok - %', label;
end $$;

create function tests.eq(got anyelement, want anyelement, label text)
returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception 'FAIL: % (got %, want %)', label, got, want;
  end if;
  raise notice 'ok - %', label;
end $$;

create function tests.throws(q text, frag text, label text)
returns void language plpgsql as $$
begin
  begin
    execute q;
  exception when others then
    if position(lower(frag) in lower(sqlerrm)) > 0 then
      raise notice 'ok - % [%]', label, sqlerrm;
      return;
    end if;
    raise exception 'FAIL: % - wrong error: %', label, sqlerrm;
  end;
  raise exception 'FAIL: % - expected an error containing "%"', label, frag;
end $$;

create function tests.new_user(p_email text, p_name text, p_tz text)
returns uuid language sql as $$
  insert into auth.users (id, email, raw_user_meta_data)
  values (gen_random_uuid(), p_email, jsonb_build_object('name', p_name, 'timezone', p_tz))
  returning id
$$;

-- Replace the app clock (superuser only; rolled back with the test).
create function tests.set_clock(p_ts timestamptz)
returns void language plpgsql as $$
begin
  execute format('create or replace function app_private.now() returns timestamptz
                  language plpgsql stable as $f$ begin return %L::timestamptz; end $f$', p_ts);
end $$;

create function tests.login(p_uid uuid)
returns void language sql as $$
  select set_config('request.jwt.claims',
                    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  select set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
$$;

grant execute on all functions in schema tests to authenticated, anon;
