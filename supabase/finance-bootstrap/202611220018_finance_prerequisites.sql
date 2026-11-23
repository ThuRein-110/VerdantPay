-- Prerequisites for a fresh, standalone Supabase project.
-- The finance membership migration replaces the legacy authorization helper.
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text check(length(display_name)<=120),
 created_at timestamptz not null default now()
);
create table public.roles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null check(role='admin')
);
create table public.rate_limits (
 key text primary key,
 window_start timestamptz not null default now(),
 hits integer not null check(hits>0)
);
create index on public.rate_limits(window_start);

alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.rate_limits enable row level security;
revoke all on public.profiles,public.roles,public.rate_limits from public,anon,authenticated,service_role;

create function public.is_admin() returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(auth.jwt()->>'aal'='aal2' and exists(
  select 1 from public.roles where user_id=auth.uid() and role='admin'
 ),false)
$$;

create function public.customer_session_active(p_session uuid,p_owner uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.sessions where id=p_session and user_id=p_owner
  and (not_after is null or not_after>now()))
$$;

create function public.take_rate_limit(p_key text,p_limit integer,p_seconds integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare hits_after integer;
begin
 if p_key is null or length(p_key) not between 1 and 160 or p_limit is null or p_limit not between 1 and 1000
    or p_seconds is null or p_seconds not between 1 and 86400 then
  raise exception 'Invalid rate limit';
 end if;
 delete from public.rate_limits where window_start<now()-interval '2 days';
 insert into public.rate_limits as r(key,hits) values(p_key,1)
 on conflict(key) do update set
  hits=case when r.window_start<=now()-make_interval(secs=>p_seconds) then 1 else least(r.hits,p_limit)+1 end,
  window_start=case when r.window_start<=now()-make_interval(secs=>p_seconds) then now() else r.window_start end
 returning hits into hits_after;
 return hits_after<=p_limit;
end $$;

revoke all on function public.is_admin(),public.customer_session_active(uuid,uuid),
 public.take_rate_limit(text,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.customer_session_active(uuid,uuid),public.take_rate_limit(text,integer,integer) to service_role;
