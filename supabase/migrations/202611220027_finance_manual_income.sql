insert into public.finance_categories(kind,name,default_satang)
values ('sale','General income',0),('expense','General expense',0)
on conflict (kind,name) do nothing;

-- A manual receipt recognizes revenue and posts cash using the existing ledger.
-- All three writes roll back together and retain their normal audit and email events.
create function public.finance_record_income(p_key uuid,p_data jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare
 entry_date date;
 description text;
 amount bigint;
 receipt_key uuid;
begin
 if not public.is_finance_admin() then
  raise exception 'Finance admin MFA required' using errcode='42501';
 end if;
 if p_key is null or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>32000 then
  raise exception 'Invalid submission';
 end if;
 entry_date:=(p_data->>'day')::date;
 description:=btrim(p_data->>'description');
 amount:=(p_data->>'amount')::bigint;
 if entry_date is null or description is null or length(description) not between 1 and 160
    or amount is null or amount not between 1 and 99999999999
    or length(p_data->>'notes')>1000 then
  raise exception 'Enter a valid description, date and positive amount';
 end if;
 receipt_key:=md5(p_key::text||':manual-income-receipt')::uuid;
 perform public.finance_write('order',p_key,jsonb_build_object(
  'day',entry_date,'reference','IN-'||p_key,'customer',description,'notes',p_data->>'notes',
  'lines',jsonb_build_array(jsonb_build_object('category',p_data->>'category','description',description,
   'quantity',1,'unit',amount,'discount',0,'fee',0))
 ));
 perform public.finance_write('payment',receipt_key,jsonb_build_object(
  'day',entry_date,'target',p_key,'account',p_data->>'account','kind','receipt','amount',amount,
  'notes',coalesce(nullif(btrim(p_data->>'notes'),''),description)
 ));
 perform public.finance_write('recognize',md5(p_key::text||':manual-income-recognition')::uuid,
  jsonb_build_object('day',entry_date,'target',p_key));
 return receipt_key;
end $$;

revoke all on function public.finance_record_income(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.finance_record_income(uuid,jsonb) to authenticated;
