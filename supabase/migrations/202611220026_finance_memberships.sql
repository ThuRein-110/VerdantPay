create table public.finance_memberships (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null default 'pending' check (role in ('pending','revoked','owner','admin','team')),
 member_id uuid unique references public.finance_members(id),
 requested_at timestamptz not null default now(),
 changed_at timestamptz not null default now(),
 changed_by uuid references auth.users(id) on delete set null,
 check ((role='team') = (member_id is not null))
);
create unique index finance_one_owner on public.finance_memberships(role) where role='owner';
alter table public.finance_memberships enable row level security;
revoke all on public.finance_memberships from public,anon,authenticated,service_role;

-- Existing provisioned administrators keep their previously approved finance access.
-- Finance approvals never add permissions to the separate printing administration.
insert into public.finance_memberships(user_id,role)
select user_id,'admin' from public.roles where role='admin' on conflict do nothing;

create function public.finance_access_role() returns text
language sql stable security definer set search_path='' as $$
 select case when auth.uid() is null then null else coalesce(
  (select role from public.finance_memberships where user_id=auth.uid()),
  'unassigned'
 ) end
$$;

create function public.is_finance_admin() returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(public.finance_access_role() in ('owner','admin') and auth.jwt()->>'aal'='aal2',false)
$$;

create function public.finance_request_access(p_name text default null) returns text
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
 if actor is null or not exists (
  select 1 from auth.users where id=actor and email_confirmed_at is not null
 ) then raise exception 'Confirmed sign-in required' using errcode='42501'; end if;
 if public.finance_access_role()='unassigned' then
  insert into public.finance_memberships(user_id) values(actor) on conflict do nothing;
  if length(btrim(p_name)) between 1 and 120 then
   insert into public.profiles(id,display_name) values(actor,btrim(p_name))
   on conflict(id) do update set display_name=coalesce(public.profiles.display_name,excluded.display_name);
  end if;
 end if;
 return public.finance_access_role();
end $$;

create function public.finance_membership_admin(p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if public.finance_access_role() is distinct from 'owner' or auth.jwt()->>'aal' is distinct from 'aal2' then
  raise exception 'Finance owner MFA required' using errcode='42501';
 end if;
 return jsonb_build_object(
  'memberships',coalesce((select jsonb_agg(to_jsonb(entry) order by entry.requested_at desc,entry.user_id)
   from (select m.user_id,m.role,m.member_id,m.requested_at,u.email,p.display_name
         from public.finance_memberships m join auth.users u on u.id=m.user_id
         left join public.profiles p on p.id=m.user_id
         where m.role<>'owner' order by m.requested_at desc,m.user_id
         limit 25 offset greatest(coalesce(p_offset,0),0)) entry),'[]'::jsonb),
  'count',(select count(*) from public.finance_memberships where role<>'owner'),
  'teams',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name) order by t.name)
   from public.finance_members t),'[]'::jsonb)
 );
end $$;

create function public.finance_set_membership(p_user uuid,p_role text,p_member uuid default null) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if public.finance_access_role() is distinct from 'owner' or auth.jwt()->>'aal' is distinct from 'aal2' then
  raise exception 'Finance owner MFA required' using errcode='42501';
 end if;
 if p_user=auth.uid() or p_role is null or p_role not in ('admin','team','revoked') or
    ((p_role='team') is distinct from (p_member is not null)) then
  raise exception 'Invalid membership change' using errcode='22023';
 end if;
 update public.finance_memberships set role=p_role,member_id=p_member,changed_at=now(),changed_by=auth.uid()
 where user_id=p_user and role<>'owner';
 return found;
end $$;

-- Team accounts see only these fields from their linked member. No cash accounts,
-- other recipients, distributable bases, order details or payment notes are exposed.
create function public.finance_my_allocations() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare linked_member uuid;
begin
 if public.finance_access_role() is distinct from 'team' or auth.jwt()->>'aal' is distinct from 'aal2' then
  raise exception 'Approved team MFA required' using errcode='42501';
 end if;
 select member_id into linked_member from public.finance_memberships where user_id=auth.uid() and role='team';
 if linked_member is null then raise exception 'Team assignment required' using errcode='42501'; end if;
 return jsonb_build_object(
  'allocations',coalesce((select jsonb_agg(to_jsonb(a) order by a.month desc,a.id)
   from (select id,month,amount_satang,adjustment_satang,paid_satang,remaining_satang
    from public.finance_payout_summary where member_id=linked_member
    order by month desc,id limit 120) a),'[]'::jsonb),
  'payments',coalesce((select jsonb_agg(to_jsonb(p) order by p.occurred_on desc,p.id)
   from (select payment.id,payment.occurred_on,payment.amount_satang from public.finance_payouts payment
    join public.finance_allocations a on a.id=payment.allocation_id where a.member_id=linked_member
    order by payment.occurred_on desc,payment.id limit 120) p),'[]'::jsonb)
 );
end $$;

revoke all on function public.finance_access_role(),public.is_finance_admin(),public.finance_request_access(text),
 public.finance_membership_admin(integer),public.finance_set_membership(uuid,text,uuid),public.finance_my_allocations()
 from public,anon,authenticated,service_role;
grant execute on function public.finance_access_role(),public.is_finance_admin(),public.finance_request_access(text),
 public.finance_membership_admin(integer),public.finance_set_membership(uuid,text,uuid),public.finance_my_allocations()
 to authenticated;

-- Retarget only known finance entry points. CREATE OR REPLACE preserves their existing grants.
do $$
declare entry regprocedure; source text; policy_row record;
begin
 foreach entry in array array[
  'public.finance_overview(date,date)'::regprocedure,'public.finance_write(text,uuid,jsonb)'::regprocedure,
  'public.finance_save_goal(uuid,integer,text,bigint,bigint,date)'::regprocedure,
  'public.finance_email_status()'::regprocedure,'public.finance_email_verify(text)'::regprocedure,
  'public.finance_email_save(boolean,text[])'::regprocedure,'public.finance_email_test()'::regprocedure
 ] loop
  source:=pg_get_functiondef(entry);
  if strpos(source,'public.is_admin()')=0 then raise exception 'Unexpected finance authorization function definition'; end if;
  execute replace(source,'public.is_admin()','public.is_finance_admin()');
 end loop;
 for policy_row in select tablename,policyname from pg_policies
  where schemaname='public' and policyname in ('finance_admin_read','finance_goals_admin_read')
 loop
  execute format('alter policy %I on public.%I to authenticated using ((select public.is_finance_admin()))',policy_row.policyname,policy_row.tablename);
 end loop;
end $$;
