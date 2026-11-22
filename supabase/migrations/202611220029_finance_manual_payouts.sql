-- Keep the existing cash and payout accounting for payments exceeding earned shares.
alter table public.finance_payouts
 alter column allocation_id drop not null,
 add column unallocated_member_id uuid references public.finance_members,
 add constraint finance_payout_exactly_one_recipient check ((allocation_id is null) <> (unallocated_member_id is null));

create or replace view public.finance_payout_register with (security_invoker=true) as
 select p.id,p.allocation_id,p.account_id,p.occurred_on,p.amount_satang,p.notes,a.name account,
  coalesce(s.name_snapshot,m.name) recipient
 from public.finance_payouts p join public.finance_accounts a on a.id=p.account_id
 left join public.finance_allocations s on s.id=p.allocation_id
 left join public.finance_members m on m.id=p.unallocated_member_id;

-- These are actual receipts. Batch children remain in the existing financial ledgers.
create view public.finance_manual_payout_history with (security_invoker=true) as
 with batches as materialized (
  select id,entity_id,action,created_at,payload->'request' request,payload->'records' records,payload->>'name' name,payload->>'excess' excess
  from public.finance_audit where action in ('manual_payout','month_payout')
 ), manual as materialized (select * from batches where action='manual_payout')
 select b.id,(b.request->>'day')::date as day,b.request->>'recipient' recipient_key,coalesce(b.name,'Owner') recipient,
  (b.request->>'amount')::bigint amount,coalesce(b.excess,'0')::bigint excess,b.records,b.created_at
 from batches b where b.action='manual_payout' or not exists(
  select 1 from manual m where m.records ? b.id::text or m.records ? b.entity_id::text
 )
 union all
 select p.id,p.occurred_on,coalesce(s.member_id,p.unallocated_member_id)::text,r.recipient,p.amount_satang,0,'[]'::jsonb,a.created_at
 from public.finance_payouts p join public.finance_payout_register r on r.id=p.id
 left join public.finance_allocations s on s.id=p.allocation_id
 left join public.finance_audit a on a.id=p.id and a.action='payout'
 where not exists(select 1 from batches b where b.records ? p.id::text)
 union all
 select c.id,c.occurred_on,'owner',c.contributor,c.amount_satang,0,'[]'::jsonb,a.created_at
 from public.finance_capital c left join public.finance_audit a on a.id=c.id and a.action='capital'
 where c.kind='owner_withdrawal'
 and not exists(select 1 from batches b where b.entity_id=c.id or b.records ? c.id::text);
revoke all on public.finance_manual_payout_history from public,anon,authenticated;

create function public.finance_payout_recipients() returns table(id text,name text)
language sql stable set search_path='' as $$
 select m.id::text,m.name from public.finance_members m
 union all select 'owner',coalesce((select nullif(trim(p.display_name),'')
  from public.finance_memberships m join public.profiles p on p.id=m.user_id where m.role='owner'),'Owner');
$$;
revoke all on function public.finance_payout_recipients() from public,anon,authenticated;

create function public.finance_manual_payout_page(p_offset integer default 0,p_record uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.is_finance_admin() then raise exception 'Finance admin MFA required' using errcode='42501'; end if;
 if p_offset is null or p_offset not between 0 and 2500000 then raise exception 'Invalid payout history page'; end if;
 with entries as materialized (
  select h.* from public.finance_manual_payout_history h where p_record is null or h.id=p_record or h.records ? p_record::text
 )
 select jsonb_build_object(
  'recipients',(select jsonb_agg(to_jsonb(r) order by (r.id='owner'),r.name,r.id) from public.finance_payout_recipients() r),
  'history',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'day',h.day,'recipient',h.recipient,
   'amount',h.amount::text,'excess',h.excess::text) order by h.day desc,h.created_at desc nulls last,h.id)
   from (select * from entries order by day desc,created_at desc nulls last,id limit 25 offset p_offset) h),'[]'::jsonb),
  'count',(select count(*) from entries)
 ) into result;
 return result;
end $$;

create function public.finance_manual_payout_balances(p_member uuid,p_day date)
returns table(month date,allocation uuid,remaining numeric)
language sql stable set search_path='' as $$
 with eligible as materialized (
  select c.month from public.finance_closes c
  where (c.month+interval '1 month - 1 day')::date<=p_day and exists(
   select 1 from public.finance_payout_summary a where a.month=c.month and a.member_id is not distinct from p_member and a.remaining_satang>0
  ) and (
   select sum(e.revenue-e.direct_cost-e.operating_cost-e.depreciation)
   from public.finance_events e where e.day>=c.month and e.day<(c.month+interval '1 month')::date
  )>0
 )
 select a.month,a.id,a.remaining_satang::numeric from public.finance_payout_summary a join eligible m on m.month=a.month
 where p_member is not null and a.member_id=p_member and a.remaining_satang>0
 union all
 select m.month,null,greatest(0,(select sum(a.remaining_satang) from public.finance_payout_summary a
  where a.month=m.month and a.member_id is null)-
  coalesce((select sum(h.amount) from public.finance_month_payout_history(m.month) h where h.kind='owner'),0))
 from eligible m where p_member is null;
$$;
revoke all on function public.finance_manual_payout_balances(uuid,date) from public,anon,authenticated;

create function public.finance_record_manual_payout(p_key uuid,p_recipient text,p_day date,p_amount bigint,p_confirm_limit numeric default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 today date:=(now() at time zone 'Asia/Bangkok')::date;
 selected_recipient text;
 recipient_name text;
 member uuid;
 acct uuid;
 previous public.finance_audit%rowtype;
 request jsonb;
 balance_row record;
 available numeric;
 remaining bigint:=p_amount;
 portion bigint;
 payment uuid;
 records jsonb:='[]'::jsonb;
begin
 if not public.is_finance_admin() then raise exception 'Finance admin MFA required' using errcode='42501'; end if;
 if p_key is null or p_recipient is null or p_amount is null or p_amount not between 1 and 99999999999 then raise exception 'payout:invalid'; end if;
 if p_day is null or p_day<'2000-01-01' or p_day>today then raise exception 'payout:date'; end if;
 if p_recipient<>'owner' then member:=p_recipient::uuid; end if;
 selected_recipient:=coalesce(member::text,'owner');
 request:=jsonb_build_object('recipient',selected_recipient,'day',p_day,'amount',p_amount);
 perform pg_advisory_xact_lock(716044121);
 select * into previous from public.finance_audit where id=p_key;
 if found then
  if previous.action<>'manual_payout' or previous.payload->'request' is distinct from request or previous.actor<>auth.uid() then
   raise exception 'payout:duplicate';
  end if;
  return jsonb_build_object('status','saved','id',previous.id);
 end if;
 select r.name into recipient_name from public.finance_payout_recipients() r where r.id=selected_recipient;
 if recipient_name is null then raise exception 'payout:recipient'; end if;
 if exists(select 1 from public.finance_manual_payout_history h
  where h.recipient_key=selected_recipient and h.day=p_day and h.amount=p_amount) then raise exception 'payout:duplicate'; end if;
 select coalesce(sum(b.remaining),0) into available from public.finance_manual_payout_balances(member,p_day) b;
 if p_amount>available and p_confirm_limit is distinct from available then
  return jsonb_build_object('status','confirm','available',available::text,'excess',(p_amount-available)::text);
 end if;
 select id into acct from public.finance_accounts where name='Cash';
 if acct is null then raise exception 'payout:account'; end if;
 for balance_row in select b.* from public.finance_manual_payout_balances(member,p_day) b
  where b.remaining>0 order by b.month,b.allocation loop
  portion:=least(remaining,balance_row.remaining);
  if member is null then
   payment:=public.finance_write('capital',gen_random_uuid(),jsonb_build_object('day',p_day,'kind','owner_withdrawal',
    'contributor',left(recipient_name,160),'amount',portion,'account',acct));
   insert into public.finance_audit(id,actor,action,entity_id,payload)
   values(gen_random_uuid(),auth.uid(),'month_payout',payment,jsonb_build_object(
    'request',jsonb_build_object('month',balance_row.month,'recipient','owner','day',p_day,'amount',portion),
    'name',recipient_name,'records','[]'::jsonb));
  else
   payment:=public.finance_write('payout',gen_random_uuid(),jsonb_build_object(
    'day',p_day,'target',balance_row.allocation,'amount',portion,'account',acct));
  end if;
  records:=records||to_jsonb(payment);
  remaining:=remaining-portion;
  exit when remaining=0;
 end loop;
 if remaining>0 then
  if member is null then
   payment:=public.finance_write('capital',gen_random_uuid(),jsonb_build_object('day',p_day,'kind','owner_withdrawal',
    'contributor',left(recipient_name,160),'amount',remaining,'account',acct));
  else
   payment:=gen_random_uuid();
   insert into public.finance_payouts(id,unallocated_member_id,account_id,occurred_on,amount_satang)
   values(payment,member,acct,p_day,remaining);
   insert into public.finance_audit(id,actor,action,entity_id,payload)
   values(payment,auth.uid(),'payout',payment,jsonb_build_object('recipient',member,'day',p_day,'amount',remaining,'account',acct));
  end if;
  records:=records||to_jsonb(payment);
 end if;
 insert into public.finance_audit(id,actor,action,entity_id,payload) values(
  p_key,auth.uid(),'manual_payout',p_key,jsonb_build_object('request',request,'records',records,'name',recipient_name,
   'excess',remaining,'confirmed_limit',case when remaining>0 then p_confirm_limit end));
 return jsonb_build_object('status','saved','id',p_key);
end $$;

revoke all on function public.finance_manual_payout_page(integer,uuid),
 public.finance_record_manual_payout(uuid,text,date,bigint,numeric) from public,anon,authenticated;
grant execute on function public.finance_manual_payout_page(integer,uuid),
 public.finance_record_manual_payout(uuid,text,date,bigint,numeric) to authenticated;
