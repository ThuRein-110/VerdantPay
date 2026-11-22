create function public.finance_assert_open(p_day date) returns void
language plpgsql set search_path='' as $$
begin
 if p_day is null or p_day<'2000-01-01' or p_day>(now() at time zone 'Asia/Bangkok')::date then raise exception 'Choose a valid posting date'; end if;
 -- Closing a month freezes it and all earlier periods.
 if exists(select 1 from public.finance_closes where month>=date_trunc('month',p_day)::date) then
  raise exception 'This period is closed. Post corrections in an open period';
 end if;
end $$;
revoke all on function public.finance_assert_open(date) from public,anon,authenticated;

create function public.finance_write(p_action text,p_key uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare
 entity uuid:=p_key;
 previous public.finance_audit%rowtype;
 d date:=nullif(p_data->>'day','')::date;
 target uuid:=nullif(p_data->>'target','')::uuid;
 acct uuid:=nullif(p_data->>'account','')::uuid;
 category uuid:=nullif(p_data->>'category','')::uuid;
 amount bigint:=nullif(p_data->>'amount','')::bigint;
 v_notes text:=nullif(trim(p_data->>'notes'),'');
 order_row public.finance_orders%rowtype;
 job_row public.finance_jobs%rowtype;
 recurring_row public.finance_recurring%rowtype;
 allocation public.finance_payout_summary%rowtype;
 item jsonb;
 spool public.finance_stock%rowtype;
 usage_id uuid;
 consumed numeric;
 net_received bigint;

 member_id_value uuid;
 points integer;
 total_points integer:=0;
 group_row record;
 allocated bigint;
begin
 if not public.is_admin() then raise exception 'Finance admin MFA required' using errcode='42501'; end if;
 if p_key is null or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>32000 then
  raise exception 'Invalid submission';
 end if;
 -- All finance writes share this transaction lock. This keeps stock, refunds, closes and payouts consistent across requests.
 perform pg_advisory_xact_lock(716044121);
 select * into previous from public.finance_audit where id=p_key;
 if found then
  if previous.action<>p_action or previous.payload<>p_data or previous.actor<>auth.uid() then raise exception 'Request key already used'; end if;
  return previous.entity_id;
 end if;

 case p_action
 when 'order' then
  perform public.finance_assert_open(d);
  if jsonb_typeof(p_data->'lines') is distinct from 'array' or jsonb_array_length(p_data->'lines') not between 1 and 25 then raise exception 'Add 1–25 line items'; end if;
  if target is not null then
   select * into strict order_row from public.finance_orders where id=target;
   perform public.finance_assert_open(order_row.booked_on);
   if order_row.recognized_on is not null or order_row.cancelled_on is not null or exists(select 1 from public.finance_payments where order_id=target) then
    raise exception 'Only open orders without payment activity can be edited';
   end if;
   entity:=target;
   update public.finance_customers set name=trim(p_data->>'customer'),contact=nullif(trim(p_data->>'contact'),'') where id=order_row.customer_id;
   update public.finance_orders set reference=trim(p_data->>'reference'),booked_on=d,notes=v_notes where id=target;
   delete from public.finance_order_lines where order_id=target;
  else
   insert into public.finance_customers(name,contact) values(trim(p_data->>'customer'),nullif(trim(p_data->>'contact'),'')) returning id into target;
   insert into public.finance_orders(id,reference,customer_id,booked_on,notes) values(entity,trim(p_data->>'reference'),target,d,v_notes);
  end if;
  for item in select value from jsonb_array_elements(p_data->'lines') loop
   select id into strict category from public.finance_categories where id=(item->>'category')::uuid and kind='sale';
   insert into public.finance_order_lines(order_id,category_id,description,quantity,unit_satang,discount_satang,fee_satang)
    values(entity,category,trim(item->>'description'),(item->>'quantity')::integer,(item->>'unit')::bigint,(item->>'discount')::bigint,(item->>'fee')::bigint);
  end loop;
 when 'recognize','cancel','payment' then
  select * into strict order_row from public.finance_orders where id=target;
  if order_row.cancelled_on is not null or d is null or d<order_row.booked_on or d>(now() at time zone 'Asia/Bangkok')::date then raise exception 'Order is cancelled or the date is invalid'; end if;
  select received_satang,outstanding_satang into net_received,allocated from public.finance_order_summary where id=target;
  if p_action='recognize' then
   perform public.finance_assert_open(d);
   if order_row.recognized_on is not null or exists(select 1 from public.finance_jobs where order_id=target and finished_on is null) or
    exists(select 1 from public.finance_payments where order_id=target and kind='refund' and occurred_on>=d) then
    raise exception 'Recognition requires finished jobs and a date after any returned deposits';
   end if;
   update public.finance_orders set recognized_on=d where id=target;
   entity:=target;
  elsif p_action='cancel' then
   perform public.finance_assert_open(d);
   if order_row.recognized_on is not null or net_received<>0 then raise exception 'Return the deposits before cancelling an unrecognized sale'; end if;
   if v_notes is null then raise exception 'Enter a cancellation reason'; end if;
   update public.finance_orders set cancelled_on=d where id=target;
   entity:=target;
  else
   if d<coalesce((select max(occurred_on) from public.finance_payments where order_id=target),d) then raise exception 'Use a date on or after the latest payment'; end if;
   if p_data->>'kind'='refund' and order_row.recognized_on is not null then
    if d<order_row.recognized_on then raise exception 'Use a refund date on or after recognition'; end if;
    perform public.finance_assert_open(d);
   end if;
   if (p_data->>'kind'='receipt' and amount>allocated) or (p_data->>'kind'='refund' and (amount>net_received or v_notes is null)) then
    raise exception 'Payment exceeds the outstanding amount, or the refund exceeds receipts or needs a reason';
   end if;
   insert into public.finance_payments values(entity,target,acct,d,p_data->>'kind',amount,v_notes);
  end if;
 when 'expense' then
  perform public.finance_assert_open(d);
  if p_data->>'recurring' is not null then
   select * into strict recurring_row from public.finance_recurring where id=(p_data->>'recurring')::uuid and enabled;
   category:=recurring_row.category_id;
   acct:=recurring_row.account_id;
   amount:=recurring_row.amount_satang;
  end if;
  select id into strict category from public.finance_categories where id=category and kind='expense';
  if exists(select 1 from public.finance_expenses where occurred_on=d and category_id=category and amount_satang=amount and
   lower(description)=lower(coalesce(recurring_row.name,trim(p_data->>'description'))) and coalesce(vendor,'')=coalesce(recurring_row.vendor,p_data->>'vendor','') and
   order_id is not distinct from target and not voided) then raise exception 'A matching expense already exists'; end if;
  insert into public.finance_expenses(id,occurred_on,category_id,description,vendor,amount_satang,account_id,order_id,recurring_id,notes,eligible,paid_on)
   values(entity,d,category,coalesce(recurring_row.name,trim(p_data->>'description')),coalesce(recurring_row.vendor,p_data->>'vendor'),
    amount,acct,target,recurring_row.id,v_notes,coalesce(recurring_row.eligible,(p_data->>'eligible')::boolean,true),case when acct is not null then d end);
 when 'pay_expense','void_expense' then
  if p_action='pay_expense' then
   if d is null or d>(now() at time zone 'Asia/Bangkok')::date then raise exception 'Choose a payment date'; end if;
   update public.finance_expenses set account_id=acct,paid_on=d where id=target and not voided and paid_on is null and occurred_on<=d and acct is not null;
  else
   if v_notes is null then raise exception 'Enter a correction reason'; end if;
   perform public.finance_assert_open((select occurred_on from public.finance_expenses where id=target));
   update public.finance_expenses set voided=true where id=target and not voided;
  end if;
  if not found then raise exception 'Expense cannot be changed'; end if;
  entity:=target;
 when 'recurring' then
  select id into strict category from public.finance_categories where id=category and kind='expense';
  insert into public.finance_recurring(id,name,enabled,category_id,vendor,amount_satang,account_id,eligible)
   values(coalesce(target,entity),trim(p_data->>'description'),coalesce((p_data->>'enabled')::boolean,true),category,p_data->>'vendor',amount,acct,coalesce((p_data->>'eligible')::boolean,true))
  on conflict(id) do update set name=excluded.name,enabled=excluded.enabled,category_id=excluded.category_id,vendor=excluded.vendor,amount_satang=excluded.amount_satang,account_id=excluded.account_id,eligible=excluded.eligible;
  entity:=coalesce(target,entity);
 when 'spool' then
  if d is null or d>(now() at time zone 'Asia/Bangkok')::date then raise exception 'Choose a purchase date'; end if;
  insert into public.finance_spools(id,material,color,brand,purchased_on,spool_grams,tare_grams,purchase_satang,account_id,location,notes)
   values(entity,trim(p_data->>'material'),trim(p_data->>'color'),p_data->>'brand',d,(p_data->>'gross')::numeric,(p_data->>'tare')::numeric,amount,acct,p_data->>'location',v_notes);
 when 'stock_adjust' then
  select * into strict spool from public.finance_stock where id=target;
  consumed:=(p_data->>'grams')::numeric(14,3);
  if d is null or d<spool.purchased_on or d>(now() at time zone 'Asia/Bangkok')::date or
   consumed+spool.remaining_grams not between 0 and spool.usable_grams or v_notes is null or exists(select 1 from public.finance_inventory_moves where spool_id=target and occurred_on>d) then
   raise exception 'Stock correction requires a reason, valid date and available capacity';
  end if;
  insert into public.finance_inventory_moves(id,spool_id,occurred_on,grams,reason) values(entity,target,d,consumed,v_notes);
 when 'job' then
  select * into strict order_row from public.finance_orders where id=target;
  if order_row.cancelled_on is not null then raise exception 'Order is cancelled'; end if;
  insert into public.finance_jobs(id,order_id,printer,estimated_satang,estimate) values(entity,target,trim(p_data->>'printer'),amount,p_data->'estimate');
 when 'finalize','reverse_job' then
  perform public.finance_assert_open(d);
  select * into strict job_row from public.finance_jobs where id=target;
  select * into strict order_row from public.finance_orders where id=job_row.order_id;
  if p_action='finalize' then
   if job_row.finished_on is not null or d<order_row.booked_on or order_row.cancelled_on is not null then
    raise exception 'Job is already finalized, order cancelled, or date precedes the order';
   end if;
   if jsonb_typeof(p_data->'materials') is distinct from 'array' or jsonb_array_length(p_data->'materials')>30 then raise exception 'Invalid material rows'; end if;
   for item in select value from jsonb_array_elements(p_data->'materials') loop
    select * into strict spool from public.finance_stock where id=(item->>'spool')::uuid;
    consumed:=(item->>'grams')::numeric(14,3);
    if consumed<=0 or consumed>spool.remaining_grams or d<spool.purchased_on or exists(select 1 from public.finance_inventory_moves where spool_id=spool.id and occurred_on>d) then
     raise exception 'Check available grams and use a date on or after the latest stock movement';
    end if;
    insert into public.finance_material_use(job_id,spool_id,kind,grams,exact_satang)
     values(target,spool.id,item->>'kind',consumed,consumed*spool.purchase_satang/spool.usable_grams) returning id into usage_id;
    insert into public.finance_inventory_moves(spool_id,occurred_on,use_id,grams,reason) values(spool.id,d,usage_id,-consumed,'finalize');
   end loop;
   if amount is null then raise exception 'Actual nonmaterial cost is required'; end if;
   update public.finance_jobs set finished_on=d,actual_nonmaterial_satang=amount,actual=p_data->'actual' where id=target;
  else
   if job_row.finished_on is null or job_row.reversed_on is not null or d<job_row.finished_on or v_notes is null then raise exception 'Choose a finalized job and give a correction reason'; end if;
   if exists(select 1 from public.finance_material_use u join public.finance_stock s on s.id=u.spool_id
    where u.job_id=target group by s.id,s.remaining_grams,s.usable_grams having s.remaining_grams+sum(u.grams)>s.usable_grams)
    or exists(select 1 from public.finance_inventory_moves m where m.occurred_on>d and m.spool_id in (select spool_id from public.finance_material_use where job_id=target)) then
    raise exception 'Reversal would exceed spool capacity or backdate a movement';
   end if;
   insert into public.finance_inventory_moves(spool_id,occurred_on,use_id,grams,reason)
    select spool_id,d,id,grams,'reverse' from public.finance_material_use where job_id=target;
   update public.finance_jobs set reversed_on=d where id=target;
  end if;
  entity:=target;
 when 'asset' then
  perform public.finance_assert_open(d);
  insert into public.finance_assets values(entity,trim(p_data->>'description'),d,amount,(p_data->>'salvage')::bigint,(p_data->>'months')::integer,acct,v_notes);
 when 'capital' then
  if d is null or d>(now() at time zone 'Asia/Bangkok')::date then raise exception 'Choose a transaction date'; end if;
  insert into public.finance_capital values(entity,d,p_data->>'kind',trim(p_data->>'contributor'),amount,acct,target,v_notes);
 when 'transfer' then
  if d is null or d>(now() at time zone 'Asia/Bangkok')::date then raise exception 'Choose a transfer date'; end if;
  insert into public.finance_transfers values(entity,d,acct,target,amount,v_notes);
 when 'account' then
  insert into public.finance_accounts values(entity,trim(p_data->>'description'));
 when 'category' then
  insert into public.finance_categories values(coalesce(target,entity),p_data->>'kind',trim(p_data->>'description'),amount)
   on conflict(id) do update set default_satang=excluded.default_satang;
  entity:=coalesce(target,entity);
 when 'member' then
  if target is null then
   insert into public.finance_members values(entity,trim(p_data->>'description'));
  else
   update public.finance_members set name=trim(p_data->>'description') where id=target;
   if not found then raise exception 'Member does not exist'; end if;
   entity:=target;
  end if;
 when 'agreement' then
  if d is null or d <= (select max(effective_on) from public.finance_agreements) or exists(select 1 from public.finance_closes where month>=date_trunc('month',d)::date) then
   raise exception 'Choose an effective date after existing agreements and closed periods';
  end if;
  if jsonb_typeof(p_data->'members') is distinct from 'array' or jsonb_array_length(p_data->'members')>30 then raise exception 'Invalid team rates'; end if;
  insert into public.finance_agreements values(entity,d,p_data->>'basis',p_data->>'method');
  for item in select value from jsonb_array_elements(p_data->'members') loop
   member_id_value:=(item->>'member')::uuid;
   points:=(item->>'points')::integer;
   total_points:=total_points+points;

   insert into public.finance_agreement_members
    select entity,id,name,points from public.finance_members where id=member_id_value;
   if not found then raise exception 'Member does not exist'; end if;
  end loop;
  if total_points>10000 then raise exception 'Total team percentages exceed 100%%'; end if;
 when 'close' then
  perform public.finance_assert_open(d);
  if extract(day from d)<>1 or d>=date_trunc('month',now() at time zone 'Asia/Bangkok')::date then raise exception 'Choose the first day of a previous month'; end if;
  if exists(select 1 from public.finance_events e where e.day<d and e.day>=coalesce((select (max(month)+interval '1 month')::date from public.finance_closes),'2000-01-01')) then
   raise exception 'Close the earliest unclosed month with financial activity first';
  end if;
  insert into public.finance_closes(month) values(d);
  for group_row in
   select ag.id agreement_id,case when ag.method='per_order' then e.order_id end order_id,
    sum(e.revenue-case ag.basis when 'gross' then e.direct_cost when 'net' then e.direct_cost+e.operating_cost+e.depreciation else e.eligible_cost end)::bigint base
   from public.finance_events e cross join lateral (select * from public.finance_agreements where effective_on<=e.day order by effective_on desc limit 1) ag
   where e.day>=d and e.day<(d+interval '1 month')::date
   group by ag.id,case when ag.method='per_order' then e.order_id end
  loop
   if group_row.base>0 then
    -- Floor member amounts to satang. The residual goes to the owner and totals always reconcile.
    insert into public.finance_allocations(month,agreement_id,order_id,member_id,name_snapshot,distributable_satang,amount_satang)
     select d,group_row.agreement_id,group_row.order_id,am.member_id,am.name_snapshot,group_row.base,
      floor(group_row.base::numeric*am.basis_points/10000)::bigint
     from public.finance_agreement_members am where am.agreement_id=group_row.agreement_id;
    select coalesce(sum(floor(group_row.base::numeric*basis_points/10000)),0)::bigint into allocated
     from public.finance_agreement_members where agreement_id=group_row.agreement_id;
    insert into public.finance_allocations(month,agreement_id,order_id,name_snapshot,distributable_satang,amount_satang)
     values(d,group_row.agreement_id,group_row.order_id,'Owner',group_row.base,group_row.base-allocated);
   end if;
  end loop;
 when 'payout','allocation_adjust' then
  select * into strict allocation from public.finance_payout_summary where id=target and member_id is not null;
  if p_action='payout' then
   if d is null or d<(allocation.month+interval '1 month - 1 day')::date or d>(now() at time zone 'Asia/Bangkok')::date or amount>allocation.remaining_satang then
    raise exception 'Invalid payout date or payment exceeds the pending share';
   end if;
   insert into public.finance_payouts values(entity,target,acct,d,amount,v_notes);
  else
   if v_notes is null or amount=0 or amount < -allocation.remaining_satang then raise exception 'Enter a reason and an adjustment that preserves existing payouts'; end if;
   select remaining_satang,id into strict allocated,usage_id from public.finance_payout_summary
    where month=allocation.month and agreement_id=allocation.agreement_id and order_id is not distinct from allocation.order_id and member_id is null;
   if amount>allocated then raise exception 'Adjustment exceeds the owner allocation'; end if;
   insert into public.finance_allocations(id,month,agreement_id,order_id,member_id,name_snapshot,distributable_satang,amount_satang,adjustment_of,notes)
    values(entity,allocation.month,allocation.agreement_id,allocation.order_id,allocation.member_id,allocation.name_snapshot,0,amount,target,v_notes),
    (gen_random_uuid(),allocation.month,allocation.agreement_id,allocation.order_id,null,'Owner',0,-amount,usage_id,v_notes);
  end if;
 else
  raise exception 'Unknown finance operation';
 end case;

 insert into public.finance_audit(id,actor,action,entity_id,payload) values(p_key,auth.uid(),p_action,entity,p_data);
 return entity;
end $$;
revoke all on function public.finance_write(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.finance_write(text,uuid,jsonb) to authenticated;
