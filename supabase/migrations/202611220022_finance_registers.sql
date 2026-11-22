create view public.finance_payment_register with (security_invoker=true) as
 select p.*,o.reference,a.name account from public.finance_payments p join public.finance_orders o on o.id=p.order_id join public.finance_accounts a on a.id=p.account_id;
create view public.finance_expense_register with (security_invoker=true) as
 select e.*,c.name category,a.name account from public.finance_expenses e join public.finance_categories c on c.id=e.category_id left join public.finance_accounts a on a.id=e.account_id;
create view public.finance_cash_register with (security_invoker=true) as
 select c.*,a.name account from public.finance_cash_entries c join public.finance_accounts a on a.id=c.account_id;
create view public.finance_payout_register with (security_invoker=true) as
 select p.*,a.name account,s.name_snapshot recipient from public.finance_payouts p join public.finance_accounts a on a.id=p.account_id join public.finance_allocations s on s.id=p.allocation_id;
create view public.finance_movement_register with (security_invoker=true) as
 select m.*,s.material,s.color from public.finance_inventory_moves m join public.finance_spools s on s.id=m.spool_id;
create view public.finance_asset_register with (security_invoker=true) as
 select a.*, a.purchase_satang-coalesce(round((a.purchase_satang-a.salvage_satang)::numeric*elapsed.months/a.useful_months),0)::bigint book_satang
 from public.finance_assets a cross join lateral (
  select count(*) months from generate_series(0,a.useful_months-1) n
  where (date_trunc('month',a.acquired_on::timestamp)+make_interval(months=>n)+interval '1 month - 1 day')::date<=(now() at time zone 'Asia/Bangkok')::date
 ) elapsed;
create view public.finance_agreement_register with (security_invoker=true) as
 select a.*,string_agg(am.name_snapshot||' '||trim_scale(am.basis_points::numeric/100)::text||'%', ', ' order by am.name_snapshot) rates
 from public.finance_agreements a left join public.finance_agreement_members am on am.agreement_id=a.id group by a.id;
do $$
declare relation text;
begin
 for relation in select viewname from pg_views where schemaname='public' and viewname like 'finance\_%' escape '\' loop
  execute format('revoke all on public.%I from public,anon,authenticated',relation);
  execute format('grant select on public.%I to authenticated',relation);
 end loop;
end $$;
