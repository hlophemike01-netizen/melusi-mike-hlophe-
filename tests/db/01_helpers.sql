-- Assertion helpers for the SQL security suite (test-only).
create schema if not exists test;

create or replace function test.assert(ok boolean, msg text)
returns void language plpgsql as $$
begin
  if ok is not true then
    raise exception 'ASSERTION FAILED: %', msg;
  end if;
  raise notice '  ok  %', msg;
end;
$$;

-- Runs `sql` and asserts that it raises. Optionally checks the message.
create or replace function test.assert_raises(sql text, msg text, expect text default null)
returns void language plpgsql as $$
declare
  err text;
begin
  begin
    execute sql;
  exception when others then
    err := sqlerrm;
    if expect is not null and position(expect in err) = 0 then
      raise exception 'ASSERTION FAILED: % — raised "%", expected to contain "%"', msg, err, expect;
    end if;
    raise notice '  ok  % (raised: %)', msg, left(err, 60);
    return;
  end;
  raise exception 'ASSERTION FAILED: % — expected an error but the statement succeeded', msg;
end;
$$;

-- Impersonate a signed-in user for subsequent statements in this session.
create or replace function test.act_as(uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text, false);
end;
$$;

create or replace function test.act_as_anon()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', false);
end;
$$;

grant usage on schema test to authenticated, anon, service_role;
grant execute on all functions in schema test to authenticated, anon, service_role;
