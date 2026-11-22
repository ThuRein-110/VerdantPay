-- All amounts are integer satang. Tables are private even to direct authenticated API requests.
create table public.finance_email_preferences (
 singleton boolean primary key default true check (singleton),
 email text check (length(email) <= 254),
 verified_at timestamptz,
 generation uuid not null default gen_random_uuid(),
 enabled boolean not null default false,
 kinds text[] not null default '{}',
 challenge_hash text,
 challenge_expires timestamptz,
 challenge_attempts integer not null default 0,
 last_challenge timestamptz,
 last_test timestamptz,
 report_day date,
 paused_until timestamptz,
 check (kinds <@ array['income','expense','investment','payout','daily','weekly','monthly','yearly'])
);
insert into public.finance_email_preferences default values;

create table public.finance_email_outbox (
 id uuid primary key default gen_random_uuid(),
 dedupe text not null unique,
 kind text not null check (kind in ('verify','test','income','expense','investment','payout','daily','weekly','monthly','yearly')),
 recipient text not null,
 generation uuid not null,
 payload jsonb not null default '{}',
 state text not null default 'pending' check (state in ('pending','sent','failed')),
 queued_at timestamptz not null default now(),
 available_at timestamptz not null default now(),
 expires_at timestamptz not null default (now()+interval '48 hours'),
 first_attempt timestamptz,
 attempts integer not null default 0,
 lease uuid,
 sent_at timestamptz,
 provider_id text,
 failure text
);
create index finance_email_due_idx on public.finance_email_outbox(available_at) where state='pending';
create index finance_email_log_idx on public.finance_email_outbox(queued_at desc, id desc);

create table public.finance_email_attempts (
 attempted_at timestamptz not null default now(),
 lease uuid primary key
);
create index finance_email_attempt_idx on public.finance_email_attempts(attempted_at);

alter table public.finance_email_preferences enable row level security;
alter table public.finance_email_outbox enable row level security;
alter table public.finance_email_attempts enable row level security;
revoke all on public.finance_email_preferences, public.finance_email_outbox, public.finance_email_attempts from public, anon, authenticated, service_role;

create function public.finance_email_status() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Finance admin MFA required' using errcode='42501'; end if;
 return (select jsonb_build_object(
  'email',p.email,'verified_at',p.verified_at,'enabled',p.enabled,'kinds',p.kinds,'paused_until',p.paused_until,
  'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.queued_at desc,h.id desc) from
   (select id,kind,state,queued_at,sent_at,attempts,failure from public.finance_email_outbox order by queued_at desc,id desc limit 30) h),'[]'::jsonb)
 ) from public.finance_email_preferences p);
end $$;

-- Only a trusted server may issue a challenge. An admin cannot submit their own known challenge.
create function public.finance_email_request(p_email text,p_code text,p_hash text) returns boolean
language plpgsql security definer set search_path='' as $$
declare p public.finance_email_preferences%rowtype;
begin
 if p_email is null or p_email <> lower(btrim(p_email)) or length(p_email)>254
    or p_email !~ '^[^[:space:]@,<>]+@[^[:space:]@,<>]+[.][^[:space:]@,<>]+$'
    or p_code is null or p_code !~ '^[0-9a-f]{24}$' or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
  raise exception 'Invalid verification request' using errcode='22023';
 end if;
 select * into p from public.finance_email_preferences where singleton for update;
 if p.last_challenge>now()-interval '5 minutes' then return false; end if;
 update public.finance_email_preferences set email=p_email, verified_at=null, enabled=false, generation=gen_random_uuid(),
  challenge_hash=p_hash,challenge_expires=now()+interval '45 minutes',challenge_attempts=0,last_challenge=now()
 where singleton returning * into p;
 update public.finance_email_outbox set state='failed',failure='recipient_changed',payload='{}',lease=null
 where state='pending' and generation<>p.generation;
 insert into public.finance_email_outbox(dedupe,kind,recipient,generation,payload,expires_at)
 values ('verify:'||p.generation,'verify',p.email,p.generation,jsonb_build_object('code',p_code),p.challenge_expires);
 return true;
end $$;

create function public.finance_email_verify(p_hash text) returns boolean
language plpgsql security definer set search_path='' as $$
declare p public.finance_email_preferences%rowtype;
begin
 if not public.is_admin() then raise exception 'Finance admin MFA required' using errcode='42501'; end if;
 select * into p from public.finance_email_preferences where singleton for update;
 if p.challenge_hash is null or p.challenge_expires<=now() or p.challenge_attempts>=8 then return false; end if;
 if p_hash is null or p.challenge_hash<>p_hash then
  update public.finance_email_preferences set challenge_attempts=challenge_attempts+1 where singleton;
  return false;
 end if;
 update public.finance_email_preferences set verified_at=now(),challenge_hash=null,challenge_expires=null where singleton;
 update public.finance_email_outbox set state='failed',failure='verification_complete',payload='{}',lease=null
 where generation=p.generation and kind='verify' and state='pending';
 return true;
end $$;

create function public.finance_email_save(p_enabled boolean,p_kinds text[]) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Finance admin MFA required' using errcode='42501'; end if;
 if p_enabled is null or p_kinds is null or cardinality(p_kinds)>8 or array_position(p_kinds,null) is not null
  or not (p_kinds <@ array['income','expense','investment','payout','daily','weekly','monthly','yearly']) then
  raise exception 'Invalid notification preferences' using errcode='22023';
 end if;
 update public.finance_email_preferences set enabled=p_enabled,kinds=p_kinds
 where singleton and (not p_enabled or verified_at is not null);
 if not found then return false; end if;
 update public.finance_email_outbox set state='failed',failure='disabled',payload='{}',lease=null
 where state='pending' and kind not in ('verify','test') and (not p_enabled or not (kind=any(p_kinds)));
 return true;
end $$;

create function public.finance_email_test() returns boolean
language plpgsql security definer set search_path='' as $$
declare p public.finance_email_preferences%rowtype;
begin
 if not public.is_admin() then raise exception 'Finance admin MFA required' using errcode='42501'; end if;
 update public.finance_email_preferences set last_test=now()
 where singleton and verified_at is not null and (last_test is null or last_test<=now()-interval '10 minutes')
 returning * into p;
 if not found then return false; end if;
 insert into public.finance_email_outbox(dedupe,kind,recipient,generation,expires_at)
 values ('test:'||gen_random_uuid(),'test',p.email,p.generation,now()+interval '2 hours');
 return true;
end $$;

-- Audit inserts occur at the end of the existing finance write, within the same commit.
create function public.finance_email_after_audit() returns trigger
language plpgsql security definer set search_path='' as $$
declare
 p public.finance_email_preferences%rowtype;
 event_kind text;
 event_amount bigint;
 event_date date;
begin
 select * into p from public.finance_email_preferences where singleton and enabled and verified_at is not null;
 if not found then return new; end if;
 case new.action
  when 'payment' then
   event_kind:='income';
   select amount_satang,occurred_on into event_amount,event_date from public.finance_payments where id=new.entity_id and kind='receipt';
  when 'expense' then
   event_kind:='expense';
   select amount_satang,occurred_on into event_amount,event_date from public.finance_expenses where id=new.entity_id;
  when 'capital' then
   event_kind:='investment';
   select amount_satang,occurred_on into event_amount,event_date from public.finance_capital
   where id=new.entity_id and kind in ('owner_contribution','team_contribution');
  when 'asset' then
   event_kind:='investment';
   select purchase_satang,acquired_on into event_amount,event_date from public.finance_assets where id=new.entity_id;
  when 'payout' then
   event_kind:='payout';
   select amount_satang,occurred_on into event_amount,event_date from public.finance_payouts where id=new.entity_id;
  else return new;
 end case;
 if event_amount is not null and event_kind=any(p.kinds) then
  insert into public.finance_email_outbox(dedupe,kind,recipient,generation,payload)
   values ('event:'||new.id,event_kind,p.email,p.generation,jsonb_build_object('amount',event_amount::text,'day',event_date))
   on conflict (dedupe) do nothing;
 end if;
 return new;
end $$;
create trigger finance_email_on_audit after insert on public.finance_audit for each row execute function public.finance_email_after_audit();

revoke all on function public.finance_email_status(),public.finance_email_request(text,text,text),public.finance_email_verify(text),
 public.finance_email_save(boolean,text[]),public.finance_email_test(),public.finance_email_after_audit()
 from public,anon,authenticated,service_role;
grant execute on function public.finance_email_status(),public.finance_email_verify(text),public.finance_email_save(boolean,text[]),
 public.finance_email_test() to authenticated;
grant execute on function public.finance_email_request(text,text,text) to service_role;
