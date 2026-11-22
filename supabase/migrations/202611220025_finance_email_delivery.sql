-- Snapshot the same recognized accounting events used by the dashboard.
create function public.finance_email_snapshot(p_from date,p_until date,p_monthly boolean) returns jsonb
language sql stable set search_path='' as $$
 with events as materialized (
  select * from public.finance_events where day>=p_from and day<p_until
 ), totals as (
  select coalesce(sum(revenue),0) revenue, coalesce(sum(direct_cost+operating_cost+depreciation),0) expenses from events
 ), closed as (
  select exists(select 1 from public.finance_closes where month=p_from) as recorded
 ), draft_groups as (
  select ag.id agreement_id,case when ag.method='per_order' then e.order_id end order_id,
   sum(e.revenue-case ag.basis when 'gross' then e.direct_cost when 'net' then e.direct_cost+e.operating_cost+e.depreciation else e.eligible_cost end) base
  from events e
  cross join lateral (select id,method,basis from public.finance_agreements where effective_on<=e.day order by effective_on desc limit 1) ag
  where p_monthly and not (select recorded from closed)
  group by ag.id,case when ag.method='per_order' then e.order_id end
 ), draft_member_parts as (
  select m.member_id,m.name_snapshot,floor(g.base*m.basis_points/10000) amount
  from draft_groups g join public.finance_agreement_members m on m.agreement_id=g.agreement_id where g.base>0
 ), parts as (
  select member_id,name_snapshot,sum(amount) amount from draft_member_parts group by member_id,name_snapshot
  union all
  select null,'Owner',coalesce((select sum(base) from draft_groups where base>0),0)-
   coalesce((select sum(amount) from draft_member_parts),0)
  where p_monthly and not (select recorded from closed)
  union all
  select member_id,name_snapshot,sum(amount_satang) from public.finance_allocations
  where p_monthly and (select recorded from closed) and month=p_from group by member_id,name_snapshot
 )
 select jsonb_build_object('from',p_from,'through',p_until-1,'income',revenue::text,'expenses',expenses::text,
  'profit',(revenue-expenses)::text,'allocation_status',case when p_monthly then case when (select recorded from closed)
   then 'recorded' else 'estimated' end end,
  'shares',coalesce((select jsonb_agg(jsonb_build_object('name',name_snapshot,'amount',amount::text,'owner',member_id is null)
   order by member_id is null,name_snapshot,member_id) from parts),'[]'::jsonb))
 from totals
$$;

-- One Bangkok-hour checkpoint handles the four periods. The unique period keys protect repeat runs.
create function public.finance_email_tick(p_at timestamptz default now()) returns boolean
language plpgsql security definer set search_path='' as $$
declare
 local_time timestamp:=p_at at time zone 'Asia/Bangkok';
 today date:=local_time::date;
 p public.finance_email_preferences%rowtype;
 period_row record;
begin
 if local_time::time>=time '08:00' and exists(
  select 1 from public.finance_email_preferences where singleton and enabled and verified_at is not null
   and kinds && array['daily','weekly','monthly','yearly'] and report_day is distinct from today
 ) then
  update public.finance_email_preferences set report_day=today where singleton and enabled and verified_at is not null
   and kinds && array['daily','weekly','monthly','yearly'] and report_day is distinct from today returning * into p;
  if found then
   for period_row in select * from (values
    ('daily',today-1,true),
    ('weekly',today-7,extract(isodow from today)=1),
    ('monthly',(today-interval '1 month')::date,extract(day from today)=1),
    ('yearly',(today-interval '1 year')::date,extract(doy from today)=1)
   ) periods(kind,starts,is_due)
   where is_due and kind=any(p.kinds) loop
    insert into public.finance_email_outbox(dedupe,kind,recipient,generation,payload)
    values ('report:'||period_row.kind||':'||period_row.starts,period_row.kind,p.email,p.generation,
     public.finance_email_snapshot(period_row.starts,today,period_row.kind='monthly'))
    on conflict (dedupe) do nothing;
   end loop;
  end if;
 end if;
 return exists(select 1 from public.finance_email_preferences where coalesce(paused_until,'-infinity')<=now())
  and exists(select 1 from public.finance_email_outbox where state='pending' and available_at<=now());
end $$;

-- Reservations count each HTTP attempt, including uncertain failures and retries.
-- All workers share the same lock, UTC windows and provider pause state.
create function public.finance_email_claim(p_recipient text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 p public.finance_email_preferences%rowtype;
 job public.finance_email_outbox%rowtype;
 stamp timestamptz:=now();
 utc_day timestamptz:=date_trunc('day',stamp at time zone 'UTC') at time zone 'UTC';
 utc_month timestamptz:=date_trunc('month',stamp at time zone 'UTC') at time zone 'UTC';
begin
 perform pg_advisory_xact_lock(538220024);
 select * into p from public.finance_email_preferences where singleton for update;
 if p_recipient is null or p.paused_until>stamp then return null; end if;
 update public.finance_email_outbox
 set state='failed',payload='{}',lease=null,failure=case when recipient<>p_recipient then 'recipient_not_approved' else 'expired' end
 where state='pending' and available_at<=stamp and
  (expires_at<=stamp or attempts>=4 or first_attempt<=stamp-interval '20 hours' or recipient<>p_recipient or generation<>p.generation);
 if (select count(*) from public.finance_email_attempts where attempted_at>=utc_month)>=2700 then
  update public.finance_email_preferences set paused_until=(date_trunc('month',stamp at time zone 'UTC')+interval '1 month') at time zone 'UTC' where singleton;
  return null;
 end if;
 if (select count(*) from public.finance_email_attempts where attempted_at>=utc_day)>=90 then
  update public.finance_email_preferences set paused_until=utc_day+interval '24 hours' where singleton;
  return null;
 end if;
 if (select count(*) from public.finance_email_attempts where attempted_at>stamp-interval '1 second')>=2 then return null; end if;
 select * into job from public.finance_email_outbox
 where state='pending' and available_at<=stamp and recipient=p.email and generation=p.generation
  and ((kind='verify' and p.verified_at is null and p.challenge_expires>stamp)
   or (p.verified_at is not null and (kind='test' or (p.enabled and kind=any(p.kinds)))))
 order by case kind when 'verify' then 0 when 'test' then 1 else 2 end, queued_at,id
 limit 1 for update skip locked;
 if not found then return null; end if;
 update public.finance_email_outbox set lease=gen_random_uuid(),attempts=attempts+1,
  first_attempt=coalesce(first_attempt,stamp),available_at=stamp+interval '5 minutes'
 where id=job.id returning * into job;
 insert into public.finance_email_attempts(lease) values(job.lease);
 return jsonb_build_object('id',job.id,'lease',job.lease,'kind',job.kind,'recipient',job.recipient,'payload',job.payload);
end $$;

create function public.finance_email_finish(p_id uuid,p_lease uuid,p_outcome text,p_provider_id text,p_delay integer default 0,p_pause text default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare
 job public.finance_email_outbox%rowtype;
 stamp timestamptz:=now();
 retry_on timestamptz;
 quota text:=coalesce(p_pause,p_outcome);
begin
 if p_outcome is null or p_outcome not in ('sent','retry','provider_rejected','daily_quota','monthly_quota') then
  raise exception 'Invalid outcome' using errcode='22023';
 end if;
 if p_pause is not null and (p_outcome<>'sent' or p_pause not in ('daily_quota','monthly_quota')) then
  raise exception 'Invalid provider quota' using errcode='22023';
 end if;
 if quota in ('daily_quota','monthly_quota') then
  retry_on:=case quota when 'daily_quota' then
   (date_trunc('day',stamp at time zone 'UTC')+interval '1 day') at time zone 'UTC'
   else (date_trunc('month',stamp at time zone 'UTC')+interval '1 month') at time zone 'UTC' end;
  update public.finance_email_preferences set paused_until=greatest(paused_until,retry_on) where singleton;
 end if;
 select * into job from public.finance_email_outbox where id=p_id and lease=p_lease and state='pending' for update;
 if not found then return false; end if;
 if p_outcome='sent' then
  if p_provider_id is null or length(p_provider_id) not between 1 and 128 then
   raise exception 'Missing provider acknowledgement' using errcode='22023';
  end if;
  update public.finance_email_outbox set state='sent',sent_at=stamp,provider_id=p_provider_id,lease=null,payload='{}',failure=null where id=p_id;
  return true;
 end if;
 retry_on:=coalesce(retry_on,stamp+make_interval(secs=>greatest(60*power(2,job.attempts-1)::integer,least(3600,coalesce(p_delay,0)))));
 if p_outcome='provider_rejected' or job.attempts>=4 or retry_on>=least(job.expires_at,job.first_attempt+interval '20 hours') then
  update public.finance_email_outbox set state='failed',payload='{}',lease=null,failure=p_outcome where id=p_id;
 else
  update public.finance_email_outbox set available_at=retry_on,lease=null,failure=p_outcome where id=p_id;
 end if;
 return true;
end $$;

revoke all on function public.finance_email_snapshot(date,date,boolean),public.finance_email_tick(timestamptz),
 public.finance_email_claim(text),public.finance_email_finish(uuid,uuid,text,text,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.finance_email_tick(timestamptz),public.finance_email_claim(text),
 public.finance_email_finish(uuid,uuid,text,text,integer,text) to service_role;
