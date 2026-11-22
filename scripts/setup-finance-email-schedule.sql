-- Run manually after setting the matching Edge secrets, creating the two Vault entries,
-- and approving delivery. This file contains no credentials.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.finance_email_run_schedule() returns void
language plpgsql security definer set search_path='' as $$
declare
 endpoint text;
 token text;
begin
 select decrypted_secret into endpoint from vault.decrypted_secrets where name='memo_email_endpoint' limit 1;
 select decrypted_secret into token from vault.decrypted_secrets where name='memo_email_scheduler_token' limit 1;
 if endpoint is null or endpoint !~ '^https://[a-z0-9]+[.]supabase[.]co/functions/v1/finance-email$'
  or token is null or length(token)<32 then
  raise exception 'Set the approved finance email Vault entries before starting the schedule';
 end if;
 if public.finance_email_tick() then
  perform net.http_post(
   url:=endpoint,
   headers:=jsonb_build_object('Authorization','Bearer '||token,'Content-Type','application/json'),
   body:='{}'::jsonb,
   timeout_milliseconds:=120000
  );
 end if;
end $$;
revoke all on function public.finance_email_run_schedule() from public,anon,authenticated,service_role;
select cron.schedule('memo-finance-email','*/15 * * * *','select public.finance_email_run_schedule()');
