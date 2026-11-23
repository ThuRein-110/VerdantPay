create index finance_audit_month_payout_idx on public.finance_audit ((payload->'request'->>'month'))
 where action='month_payout';
create index finance_audit_payout_entity_idx on public.finance_audit (entity_id) where action='month_payout';

-- A batch links one receipt to the existing team payout rows or to one capital withdrawal.
create function public.finance_month_payout_history(p_month date)
returns table(id uuid, day date, recipient text, amount bigint, kind text)
language sql stable set search_path='' as $$
 with batches as materialized (
  select a.id,a.entity_id,a.payload->>'name' name,a.payload->'request' req,a.payload->'records' records
  from public.finance_audit a
  where a.action='month_payout' and a.payload->'request'->>'month'=to_char(p_month,'YYYY-MM-DD')
 ), team as materialized (
  select p.id,p.occurred_on,a.name_snapshot,p.amount_satang
  from public.finance_payouts p join public.finance_allocations a on a.id=p.allocation_id where a.month=p_month
 )
 select b.id,min(t.occurred_on),coalesce(b.name,min(t.name_snapshot)),sum(t.amount_satang)::bigint,'team'::text
 from batches b join team t on b.records ? t.id::text group by b.id,b.name
 union all
 select t.id,t.occurred_on,t.name_snapshot,t.amount_satang,'team' from team t
 where not exists(select 1 from batches b where b.records ? t.id::text)
 union all
 select c.id,c.occurred_on,c.contributor,c.amount_satang,'owner'
 from batches b join public.finance_capital c on c.id=b.entity_id
 where b.req->>'recipient'='owner' and c.kind='owner_withdrawal'
 union all
 select c.id,c.occurred_on,c.contributor,c.amount_satang,'unlinked'
 from public.finance_capital c where c.kind='owner_withdrawal'
  and c.occurred_on>=p_month and c.occurred_on<(p_month+interval '1 month')::date
  and not exists(select 1 from public.finance_audit a where a.entity_id=c.id and a.action='month_payout');
$$;
revoke all on function public.finance_month_payout_history(date) from public,anon,authenticated;

create function public.finance_month_payout_page(p_month date,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
 today date:=(now() at time zone 'Asia/Bangkok')::date;
 last_day date:=(p_month+interval '1 month - 1 day')::date;
 last_close date;
 closed boolean;
 earlier_open date;
 result jsonb;
begin
 if not public.is_finance_admin() then raise exception 'Finance admin MFA required' using errcode='42501'; end if;
 if p_month is null or p_month<'2000-01-01' or extract(day from p_month)<>1 or p_month>today or
    p_offset is null or p_offset not between 0 and 2500000 then raise exception 'Choose a valid payout month'; end if;
 select max(month),coalesce(bool_or(month=p_month),false) into last_close,closed from public.finance_closes;
 if not closed and (last_close is null or last_close<p_month) then
  select date_trunc('month',min(day))::date into earlier_open from public.finance_events
  where day<p_month and day>=coalesce((last_close+interval '1 month')::date,'2000-01-01');
 end if;
 with events as materialized (
  select * from public.finance_events where day between p_month and least(today,last_day)
 ), net as (
  select coalesce(sum(revenue-direct_cost-operating_cost-depreciation),0) amount from events
 ), groups as (
  -- Use the same effective dates, basis, grouping and rounding as the month-close command.
  select ag.id,case when ag.method='per_order' then e.order_id end order_id,
   sum(e.revenue-case ag.basis when 'gross' then e.direct_cost when 'net' then e.direct_cost+e.operating_cost+e.depreciation else e.eligible_cost end)::bigint base
  from events e cross join lateral (select * from public.finance_agreements where effective_on<=e.day order by effective_on desc limit 1) ag
  where not closed and (last_close is null or last_close<p_month)
  group by ag.id,case when ag.method='per_order' then e.order_id end
 ), projected as (
  select am.member_id,am.name_snapshot,floor(g.base::numeric*am.basis_points/10000)::bigint amount
  from groups g join public.finance_agreement_members am on am.agreement_id=g.id cross join net
  where g.base>0 and net.amount>0
  union all
  select null,'Owner',g.base-coalesce((select sum(floor(g.base::numeric*am.basis_points/10000))
   from public.finance_agreement_members am where am.agreement_id=g.id),0)::bigint
  from groups g cross join net where g.base>0 and net.amount>0
 ), history as materialized (
  select * from public.finance_month_payout_history(p_month)
 ), allocation_rows as (
  select member_id,name_snapshot,amount_satang+adjustment_satang amount,paid_satang paid
  from public.finance_payout_summary where month=p_month
  union all select member_id,name_snapshot,amount,0 from projected
 ), rates as (
  select member_id,name_snapshot,basis_points from public.finance_agreement_members
  where agreement_id=(select id from public.finance_agreements where effective_on<=least(last_day,today) order by effective_on desc limit 1)
 ), recipients as (
  select member_id::text id,name_snapshot name,basis_points points from rates
  union all
  select a.member_id::text, min(a.name_snapshot),null from allocation_rows a
  where a.member_id is not null and not exists(select 1 from rates r where r.member_id=a.member_id) group by a.member_id
  union all select 'owner','Owner',10000-coalesce((select sum(basis_points) from rates),0)::integer
 ), balances as (
  select r.*,coalesce(sum(a.amount),0) share,
   case when r.id='owner' then coalesce((select sum(amount) from history where kind='owner'),0) else coalesce(sum(a.paid),0) end paid
  from recipients r left join allocation_rows a on r.id=coalesce(a.member_id::text,'owner')
  group by r.id,r.name,r.points
 )
 select jsonb_build_object(
  'net',net.amount::text,'closed',closed,'frozen',not closed and coalesce(last_close>p_month,false),
  'canClose',not closed and p_month<date_trunc('month',today)::date and (last_close is null or last_close<p_month)
   and earlier_open is null,
  'requiredCloseMonth',to_char(earlier_open,'YYYY-MM'),
  'recipients',(select jsonb_agg(jsonb_build_object('id',id,'name',name,'points',points,'share',share::text,'paid',paid::text,
   'remaining',greatest(0,share-paid)::text) order by (id='owner'),name,id) from balances),
  'history',coalesce((select jsonb_agg(to_jsonb(h)||jsonb_build_object('amount',h.amount::text) order by h.day desc,h.id)
    from (select * from history order by day desc,id limit 25 offset p_offset) h),'[]'::jsonb),
  'historyCount',(select count(*) from history)
 ) into result from net;
 return result;
end $$;

create function public.finance_record_month_payout(p_key uuid,p_month date,p_recipient text,p_day date,p_amount bigint,
 p_account uuid default null,p_notes text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare
 previous public.finance_audit%rowtype;
 request jsonb;
 records jsonb:='[]'::jsonb;
 today date:=(now() at time zone 'Asia/Bangkok')::date;
 member uuid;
 recipient_name text;
 allocation record;
 balance numeric;
 remaining bigint:=p_amount;
 portion bigint;
 payment uuid;
 acct uuid;
begin
 if not public.is_finance_admin() then raise exception 'Finance admin MFA required' using errcode='42501'; end if;
 if p_key is null or p_month is null or extract(day from p_month)<>1 or p_recipient is null or
    p_amount is null or p_amount not between 1 and 99999999999 or length(coalesce(p_notes,''))>1000 then raise exception 'payout:invalid'; end if;
 if p_recipient<>'owner' then member:=p_recipient::uuid; end if;
 request:=jsonb_build_object('month',p_month,'recipient',coalesce(member::text,'owner'),'day',p_day,'amount',p_amount,
  'account',p_account,'notes',nullif(trim(p_notes),''));
 perform pg_advisory_xact_lock(716044121);
 select * into previous from public.finance_audit where id=p_key;
 if found then
  if previous.action<>'month_payout' or previous.payload->'request' is distinct from request or previous.actor<>auth.uid() then
   raise exception 'payout:duplicate';
  end if;
  return previous.entity_id;
 end if;
 if not exists(select 1 from public.finance_closes where month=p_month) then raise exception 'payout:open'; end if;
 if p_day is null or p_day<(p_month+interval '1 month - 1 day')::date or p_day>today then raise exception 'payout:date'; end if;
 if (select coalesce(sum(revenue-direct_cost-operating_cost-depreciation),0) from public.finance_events
   where day between p_month and (p_month+interval '1 month - 1 day')::date)<=0 then raise exception 'payout:profit'; end if;
 acct:=coalesce(p_account,(select id from public.finance_accounts where name='Cash'));
 if acct is null or not exists(select 1 from public.finance_accounts where id=acct) then raise exception 'payout:account'; end if;
 if exists(select 1 from public.finance_audit a where a.action='month_payout' and
   a.payload->'request'->>'month'=to_char(p_month,'YYYY-MM-DD') and
   a.payload->'request' @> jsonb_build_object('recipient',coalesce(member::text,'owner'),'day',p_day,'amount',p_amount))
   or (member is not null and exists(
    select 1 from public.finance_payouts p join public.finance_allocations a on a.id=p.allocation_id
    where a.month=p_month and a.member_id=member and p.occurred_on=p_day and p.amount_satang=p_amount
     and not exists(select 1 from public.finance_audit b where b.action='month_payout'
      and b.payload->'request'->>'month'=to_char(p_month,'YYYY-MM-DD') and b.payload->'records' ? p.id::text)
   )) then raise exception 'payout:duplicate'; end if;
 if member is null then
  select coalesce(sum(remaining_satang),0) into balance from public.finance_payout_summary where month=p_month and member_id is null;
  balance:=balance-coalesce((select sum(amount) from public.finance_month_payout_history(p_month) where kind='owner'),0);
 else
  select coalesce(sum(remaining_satang),0),min(name_snapshot) into balance,recipient_name
   from public.finance_payout_summary where month=p_month and member_id=member;
 end if;
 if p_amount>balance then raise exception 'payout:balance'; end if;
 if member is null then
  payment:=public.finance_write('capital',gen_random_uuid(),jsonb_build_object(
   'day',p_day,'kind','owner_withdrawal','contributor','Owner','amount',p_amount,'account',acct,'notes',p_notes
  ));
 else
  for allocation in select id,remaining_satang from public.finance_payout_summary
    where month=p_month and member_id=member and remaining_satang>0 order by agreement_id,order_id,id loop
   portion:=least(remaining,allocation.remaining_satang);
   payment:=public.finance_write('payout',gen_random_uuid(),jsonb_build_object(
    'day',p_day,'target',allocation.id,'amount',portion,'account',acct,'notes',p_notes));
   records:=records||to_jsonb(payment);
   remaining:=remaining-portion;
   exit when remaining=0;
  end loop;
 end if;
 insert into public.finance_audit(id,actor,action,entity_id,payload)
 values(p_key,auth.uid(),'month_payout',case when member is null then payment else p_key end,
  jsonb_build_object('request',request,'name',recipient_name,'records',records));
 return case when member is null then payment else p_key end;
end $$;

revoke all on function public.finance_month_payout_page(date,integer),
 public.finance_record_month_payout(uuid,date,text,date,bigint,uuid,text) from public,anon,authenticated;
grant execute on function public.finance_month_payout_page(date,integer),
 public.finance_record_month_payout(uuid,date,text,date,bigint,uuid,text) to authenticated;

create function public.finance_protect_owner_withdrawals() returns trigger
language plpgsql set search_path='' as $$
declare withdrawn numeric;
begin
 select sum(amount) into withdrawn from public.finance_month_payout_history(new.month) where kind='owner';
 if withdrawn is not null and withdrawn>(select coalesce(sum(amount_satang),0)+new.amount_satang
  from public.finance_allocations where month=new.month and member_id is null) then
  raise exception 'Adjustment would reduce the owner allocation below recorded withdrawals';
 end if;
 return new;
end $$;
create trigger finance_protect_owner_withdrawals before insert on public.finance_allocations for each row
 when (new.member_id is null and new.adjustment_of is not null and new.amount_satang<0)
 execute function public.finance_protect_owner_withdrawals();
revoke all on function public.finance_protect_owner_withdrawals() from public,anon,authenticated;
