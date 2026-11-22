create view public.finance_cash_entries with (security_invoker=true) as
 select id, occurred_on, account_id, case kind when 'receipt' then amount_satang else -amount_satang end as amount_satang, kind, notes from public.finance_payments
 union all select id,paid_on,account_id,-amount_satang,'expense',description from public.finance_expenses where paid_on is not null and not voided
 union all select id,purchased_on,account_id,-purchase_satang,'filament_purchase',material||' / '||color from public.finance_spools
 union all select id,acquired_on,account_id,-purchase_satang,'equipment',name from public.finance_assets
 union all select id,occurred_on,account_id,case when kind in ('owner_contribution','team_contribution','loan') then amount_satang else -amount_satang end,kind,contributor from public.finance_capital
 union all select id,occurred_on,from_account,-amount_satang,'transfer_out',notes from public.finance_transfers
 union all select id,occurred_on,to_account,amount_satang,'transfer_in',notes from public.finance_transfers
 union all select id,occurred_on,account_id,-amount_satang,'team_payout',notes from public.finance_payouts;
create view public.finance_stock with (security_invoker=true) as
 select s.*, case when s.usable_grams>0 then s.purchase_satang::numeric/s.usable_grams end as satang_per_gram,
 s.usable_grams+coalesce(m.grams,0) as remaining_grams,
 round((s.usable_grams+coalesce(m.grams,0))*s.purchase_satang/s.usable_grams)::bigint as value_satang
 from public.finance_spools s left join (select spool_id,sum(grams) grams from public.finance_inventory_moves group by spool_id) m on m.spool_id=s.id;
create view public.finance_job_summary with (security_invoker=true) as
 select j.*,o.reference,coalesce(m.grams,0) grams,coalesce(m.material_satang,0) material_satang,
 case when j.finished_on is not null then coalesce(m.material_satang,0)+j.actual_nonmaterial_satang end actual_satang
 from public.finance_jobs j join public.finance_orders o on o.id=j.order_id left join
 (select job_id,sum(grams) grams,round(sum(exact_satang))::bigint material_satang from public.finance_material_use group by job_id) m on m.job_id=j.id;
create view public.finance_material_events with (security_invoker=true) as
 select m.id,m.occurred_on,j.order_id,s.material,s.color,u.kind,-m.grams grams
 from public.finance_inventory_moves m join public.finance_material_use u on u.id=m.use_id
 join public.finance_jobs j on j.id=u.job_id join public.finance_spools s on s.id=m.spool_id;
create view public.finance_order_summary with (security_invoker=true) as
 select o.*,c.name customer,c.contact,coalesce(l.total,0)::bigint invoiced_satang,coalesce(p.receipts,0)::bigint received_satang,
 coalesce(p.credits,0)::bigint credits_satang,
 case when o.cancelled_on is null then greatest(0,coalesce(l.total,0)-coalesce(p.credits,0)-coalesce(p.receipts,0))::bigint else 0 end outstanding_satang,
 coalesce(j.grams,0) grams,coalesce(j.material_satang,0)::bigint material_satang,
 coalesce(j.production,0)::bigint production_satang,coalesce(e.total,0)::bigint booked_cost_satang,
 case when o.recognized_on is not null then (coalesce(l.total,0)-coalesce(p.credits,0)-coalesce(j.production,0)-coalesce(e.total,0))::bigint end order_profit_satang,
 coalesce(a.total,0)::bigint team_satang
 from public.finance_orders o join public.finance_customers c on c.id=o.customer_id
 left join (select order_id,sum(total_satang) total from public.finance_order_lines group by order_id) l on l.order_id=o.id
 left join lateral (select sum(case kind when 'receipt' then amount_satang else -amount_satang end) receipts,
 sum(amount_satang) filter(where kind='refund' and occurred_on>=o.recognized_on) credits from public.finance_payments where order_id=o.id) p on true
 left join (select order_id,sum(actual_satang) production,sum(material_satang) material_satang,sum(grams) grams from public.finance_job_summary where finished_on is not null and reversed_on is null group by order_id) j on j.order_id=o.id
 left join (select order_id,sum(amount_satang) total from public.finance_expenses where not voided group by order_id) e on e.order_id=o.id
 left join (select order_id,sum(amount_satang) total from public.finance_allocations where member_id is not null group by order_id) a on a.order_id=o.id;
create view public.finance_payout_summary with (security_invoker=true) as
 select a.*, coalesce(d.amount,0)::bigint adjustment_satang,coalesce(p.amount,0)::bigint paid_satang,
 (a.amount_satang+coalesce(d.amount,0)-coalesce(p.amount,0))::bigint remaining_satang
 from public.finance_allocations a
 left join (select adjustment_of,sum(amount_satang) amount from public.finance_allocations group by adjustment_of) d on d.adjustment_of=a.id
 left join (select allocation_id,sum(amount_satang) amount from public.finance_payouts group by allocation_id) p on p.allocation_id=a.id
 where a.adjustment_of is null;
create view public.finance_events with (security_invoker=true) as
 select o.recognized_on as day,o.id order_id,c.name category,l.total_satang revenue,0::bigint direct_cost,0::bigint operating_cost,0::bigint eligible_cost,0::bigint depreciation
 from public.finance_orders o join public.finance_order_lines l on l.order_id=o.id join public.finance_categories c on c.id=l.category_id where o.recognized_on is not null
 union all select p.occurred_on,o.id,'Refunds',-p.amount_satang,0,0,0,0 from public.finance_payments p join public.finance_orders o on o.id=p.order_id where p.kind='refund' and p.occurred_on>=o.recognized_on
 union all select finished_on,order_id,null,0,material_satang,0,material_satang,0 from public.finance_job_summary where finished_on is not null
 union all select reversed_on,order_id,null,0,-material_satang,0,-material_satang,0 from public.finance_job_summary where reversed_on is not null
 union all select occurred_on,order_id,null,0,case when order_id is not null then amount_satang else 0 end,case when order_id is null then amount_satang else 0 end,
 case when eligible then amount_satang else 0 end,0 from public.finance_expenses where not voided
 union all select (date_trunc('month',a.acquired_on::timestamp)+make_interval(months=>n)+interval '1 month - 1 day')::date,null,null,0,0,0,0,
 (round((a.purchase_satang-a.salvage_satang)::numeric*(n+1)/a.useful_months)-round((a.purchase_satang-a.salvage_satang)::numeric*n/a.useful_months))::bigint
 from public.finance_assets a cross join lateral generate_series(0,a.useful_months-1) n where a.useful_months is not null;

do $$
declare relation text;
begin
 for relation in select viewname from pg_views where schemaname='public' and viewname like 'finance\_%' escape '\' loop
  execute format('revoke all on public.%I from public,anon,authenticated',relation);
  execute format('grant select on public.%I to authenticated',relation);
 end loop;
end $$;

create function public.finance_overview(p_from date,p_to date) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if not public.is_admin() then raise exception 'Finance admin MFA required' using errcode='42501'; end if;
 if p_to<p_from or p_to-p_from>366 then raise exception 'Choose a date range of at most 367 days'; end if;
 with events as materialized (select * from public.finance_events where day between p_from and p_to),
 totals as (select coalesce(sum(revenue),0) revenue,coalesce(sum(direct_cost),0) direct_cost,
 coalesce(sum(operating_cost),0) operating_cost,coalesce(sum(eligible_cost),0) eligible_cost,coalesce(sum(depreciation),0) depreciation from events),
 shares as (select coalesce(sum(amount_satang) filter(where member_id is not null),0) team,
 coalesce(sum(amount_satang) filter(where member_id is null),0) owner
 from public.finance_allocations where month between date_trunc('month',p_from)::date and date_trunc('month',p_to)::date),
 timeline as (
 select bucket.day,coalesce(sum(revenue),0) revenue,coalesce(sum(direct_cost+operating_cost+depreciation),0) costs,
 coalesce(sum(revenue-direct_cost-operating_cost-depreciation),0) profit,
 case when sum(revenue)>0 then round(100*sum(revenue-direct_cost-operating_cost-depreciation)/sum(revenue),2) end margin
 from (select generate_series(date_trunc('month',p_from)::timestamp,date_trunc('month',p_to)::timestamp,interval '1 month')::date as day) bucket
 left join events on date_trunc('month',events.day)::date=bucket.day group by bucket.day),
 daily as (select day,sum(revenue) revenue from events group by day having sum(revenue)<>0),
 categories as (select category,sum(revenue) revenue from events where category is not null group by category),
 consumption as (select date_trunc('month',occurred_on)::date as day,sum(grams) grams from public.finance_material_events where occurred_on between p_from and p_to group by 1)
 select jsonb_build_object(
 'revenue',t.revenue,'directCost',t.direct_cost,'operating',t.operating_cost,'eligible',t.eligible_cost,
 'depreciation',t.depreciation,'gross',t.revenue-t.direct_cost,'net',t.revenue-t.direct_cost-t.operating_cost-t.depreciation,
 'team',s.team,'ownerAllocation',s.owner,'ownerRemaining',t.revenue-t.direct_cost-t.operating_cost-t.depreciation-s.team,
 'cash',coalesce((select sum(amount_satang) from public.finance_cash_entries),0),
 'received',coalesce((select sum(amount_satang) from public.finance_cash_entries where kind in ('receipt','refund') and occurred_on between p_from and p_to),0),
 'invoiced',coalesce((select sum(invoiced_satang) from public.finance_order_summary where booked_on between p_from and p_to and cancelled_on is null),0),
 'receivable',coalesce((select sum(outstanding_satang) from public.finance_order_summary),0),
 'payable',coalesce((select sum(amount_satang) from public.finance_expenses where not voided and paid_on is null),0),
 'teamPaid',coalesce((select sum(amount_satang) from public.finance_payouts where occurred_on between p_from and p_to),0),
 'teamPayable',coalesce((select sum(remaining_satang) from public.finance_payout_summary where member_id is not null),0),
 'withdrawals',coalesce((select sum(amount_satang) from public.finance_capital where kind='owner_withdrawal' and occurred_on between p_from and p_to),0),
 'stock',coalesce((select sum(value_satang) from public.finance_stock),0),
 'investment',coalesce((select sum(case when kind='capital_repayment' then -amount_satang else amount_satang end) from public.finance_capital where kind in ('owner_contribution','team_contribution','capital_repayment')),0),
 'assets',coalesce((select sum(purchase_satang) from public.finance_assets),0)-(select coalesce(sum(depreciation),0) from public.finance_events where day<=(now() at time zone 'Asia/Bangkok')::date),
 'accounts',coalesce((select jsonb_agg(row_data order by row_data.name) from (select a.name,coalesce(sum(c.amount_satang),0) balance from public.finance_accounts a left join public.finance_cash_entries c on c.account_id=a.id group by a.id) row_data),'[]'::jsonb),
 'monthly',coalesce((select jsonb_agg(timeline order by day) from timeline),'[]'::jsonb),
 'daily',coalesce((select jsonb_agg(daily order by day) from daily),'[]'::jsonb),
 'categories',coalesce((select jsonb_agg(categories order by revenue desc) from categories),'[]'::jsonb),
 'consumption',coalesce((select jsonb_agg(consumption order by day) from consumption),'[]'::jsonb)) into result
 from totals t cross join shares s;
 return result;
end $$;
revoke all on function public.finance_overview(date,date) from public,anon,authenticated;
grant execute on function public.finance_overview(date,date) to authenticated;
