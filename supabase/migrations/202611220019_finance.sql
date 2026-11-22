-- Finance records belong to the business. Existing customer accounts and bookings stay independent.
create table public.finance_accounts (
 id uuid primary key default gen_random_uuid(), name text not null unique check(length(name) between 1 and 100)
);
insert into public.finance_accounts(name) values ('Cash'),('Bank'),('PromptPay'),('Other');
create table public.finance_categories (
 id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('sale','expense')),
 name text not null check(length(name) between 1 and 100), default_satang bigint not null default 0 check(default_satang >= 0),
 unique(kind,name)
);
insert into public.finance_categories(kind,name,default_satang) values
 ('sale','Basic 3D printing',10000),('sale','Custom 3D design',150000),('sale','Keychains',0),('sale','Accessories',0),('sale','Other services',0),
 ('expense','Electricity',0),('expense','Printer maintenance',0),('expense','Replacement parts',0),('expense','Packaging',0),
 ('expense','Delivery',0),('expense','Marketing',0),('expense','Software and websites',0),('expense','Tools',0),('expense','Miscellaneous',0);
create table public.finance_customers (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 160), contact text
);
create table public.finance_orders (
 id uuid primary key default gen_random_uuid(), reference text not null unique check(length(reference) between 1 and 100),
 customer_id uuid not null references public.finance_customers, booked_on date not null, recognized_on date, cancelled_on date,
 notes text, check(recognized_on >= booked_on), check(cancelled_on >= booked_on),
 check(recognized_on is null or cancelled_on is null)
);
create table public.finance_order_lines (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.finance_orders,
 category_id uuid not null references public.finance_categories, description text not null check(length(description) between 1 and 160),
 quantity integer not null check(quantity between 1 and 100000), unit_satang bigint not null check(unit_satang between 0 and 100000000000),
 discount_satang bigint not null check(discount_satang >= 0), fee_satang bigint not null check(fee_satang >= 0),
 total_satang bigint generated always as (quantity * unit_satang - discount_satang + fee_satang) stored,
 check(total_satang between 0 and 100000000000)
);
create table public.finance_payments (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.finance_orders,
 account_id uuid not null references public.finance_accounts, occurred_on date not null,
 kind text not null check(kind in ('receipt','refund')), amount_satang bigint not null check(amount_satang between 1 and 100000000000),
 notes text
);
create table public.finance_recurring (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 160), enabled boolean not null default true,
 category_id uuid not null references public.finance_categories, vendor text, amount_satang bigint not null check(amount_satang between 1 and 100000000000),
 account_id uuid references public.finance_accounts, eligible boolean not null default true
);
create table public.finance_expenses (
 id uuid primary key default gen_random_uuid(), occurred_on date not null, category_id uuid not null references public.finance_categories,
 description text not null check(length(description) between 1 and 160), vendor text,
 amount_satang bigint not null check(amount_satang between 1 and 100000000000), account_id uuid references public.finance_accounts,
 order_id uuid references public.finance_orders, recurring_id uuid references public.finance_recurring, notes text,
 eligible boolean not null default true, paid_on date, voided boolean not null default false,
 check((paid_on is null) = (account_id is null)), check(paid_on >= occurred_on)
);
create unique index finance_unique_recurring_month on public.finance_expenses(recurring_id,(date_trunc('month',occurred_on::timestamp))) where recurring_id is not null and not voided;
create table public.finance_spools (
 id uuid primary key default gen_random_uuid(), material text not null check(length(material) between 1 and 80),
 color text not null check(length(color) between 1 and 80), brand text, purchased_on date not null,
 spool_grams numeric(14,3) not null check(spool_grams > 0), tare_grams numeric(14,3) not null check(tare_grams >= 0 and tare_grams < spool_grams),
 usable_grams numeric(14,3) generated always as (spool_grams - tare_grams) stored,
 purchase_satang bigint not null check(purchase_satang between 0 and 100000000000),
 account_id uuid not null references public.finance_accounts, location text, notes text
);
create table public.finance_jobs (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.finance_orders,
 printer text not null check(length(printer) between 1 and 100), estimated_satang bigint not null check(estimated_satang between 0 and 100000000000),
 estimate jsonb not null, finished_on date, reversed_on date, actual jsonb,
 actual_nonmaterial_satang bigint check(actual_nonmaterial_satang between 0 and 100000000000), check(reversed_on >= finished_on)
);
create table public.finance_material_use (
 id uuid primary key default gen_random_uuid(), job_id uuid not null references public.finance_jobs, spool_id uuid not null references public.finance_spools,
 kind text not null check(kind in ('model','supports','brim','purge','failed','calibration')),
 grams numeric(14,3) not null check(grams > 0), exact_satang numeric not null check(exact_satang >= 0),
 unique(job_id,spool_id,kind)
);
create table public.finance_inventory_moves (
 id uuid primary key default gen_random_uuid(), spool_id uuid not null references public.finance_spools, occurred_on date not null,
 use_id uuid references public.finance_material_use, grams numeric(14,3) not null check(grams <> 0), reason text not null check(length(reason)>0),
 unique(use_id,reason)
);
create table public.finance_assets (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 160), acquired_on date not null,
 purchase_satang bigint not null check(purchase_satang between 1 and 100000000000),
 salvage_satang bigint not null check(salvage_satang between 0 and purchase_satang), useful_months integer check(useful_months between 1 and 600),
 account_id uuid not null references public.finance_accounts, notes text
);
create table public.finance_capital (
 id uuid primary key default gen_random_uuid(), occurred_on date not null,
 kind text not null check(kind in ('owner_contribution','team_contribution','loan','loan_repayment','owner_withdrawal','capital_repayment')),
 contributor text not null check(length(contributor) between 1 and 160), amount_satang bigint not null check(amount_satang between 1 and 100000000000),
 account_id uuid not null references public.finance_accounts, asset_id uuid references public.finance_assets, notes text
);
create table public.finance_transfers (
 id uuid primary key default gen_random_uuid(), occurred_on date not null,
 from_account uuid not null references public.finance_accounts, to_account uuid not null references public.finance_accounts,
 amount_satang bigint not null check(amount_satang between 1 and 100000000000), notes text, check(from_account<>to_account)
);
create table public.finance_members (
 id uuid primary key default gen_random_uuid(), name text not null unique check(length(name) between 1 and 100)
);
create table public.finance_agreements (
 id uuid primary key default gen_random_uuid(), effective_on date not null unique,
 basis text not null check(basis in ('eligible','net','gross')), method text not null check(method in ('monthly','per_order'))
);
create table public.finance_agreement_members (
 agreement_id uuid not null references public.finance_agreements, member_id uuid not null references public.finance_members,
 name_snapshot text not null, basis_points integer not null check(basis_points between 1 and 10000), primary key(agreement_id,member_id)
);
with agreement as (insert into public.finance_agreements(effective_on,basis,method) values ('2000-01-01','eligible','monthly') returning id),
 members as (insert into public.finance_members(name) values ('Team Member 1'),('Team Member 2') returning *)
insert into public.finance_agreement_members select agreement.id,members.id,members.name,1500 from agreement cross join members;
create table public.finance_closes (
 month date primary key check(extract(day from month)=1), created_at timestamptz not null default now()
);
create table public.finance_allocations (
 id uuid primary key default gen_random_uuid(), month date not null references public.finance_closes,
 agreement_id uuid not null references public.finance_agreements, order_id uuid references public.finance_orders,
 member_id uuid references public.finance_members, name_snapshot text not null,
 distributable_satang bigint not null check(distributable_satang >= 0), amount_satang bigint not null,
 adjustment_of uuid references public.finance_allocations, notes text,
 constraint finance_positive_initial_allocation check (adjustment_of is not null or amount_satang >= 0)
);
create table public.finance_payouts (
 id uuid primary key default gen_random_uuid(), allocation_id uuid not null references public.finance_allocations,
 account_id uuid not null references public.finance_accounts, occurred_on date not null,
 amount_satang bigint not null check(amount_satang between 1 and 100000000000), notes text
);
create table public.finance_audit (
 id uuid primary key, actor uuid not null references auth.users, action text not null, entity_id uuid not null,
 payload jsonb not null, created_at timestamptz not null default now()
);

create index on public.finance_orders(booked_on);
create index on public.finance_orders(recognized_on);
create index on public.finance_order_lines(order_id);
create index on public.finance_payments(order_id,occurred_on);
create index on public.finance_expenses(occurred_on);
create index on public.finance_expenses(order_id);
create index on public.finance_jobs(order_id);
create index on public.finance_jobs(finished_on);
create index on public.finance_inventory_moves(spool_id,occurred_on);
create index on public.finance_allocations(month);
create index on public.finance_allocations(adjustment_of);
create index on public.finance_payouts(allocation_id);
create index on public.finance_audit(created_at);

-- Explicit grants protect against default PostgREST table privileges.
do $$
declare relation text;
begin
 for relation in select tablename from pg_tables where schemaname='public' and tablename like 'finance\_%' escape '\' loop
  execute format('alter table public.%I enable row level security',relation);
  execute format('revoke all on public.%I from public,anon,authenticated',relation);
  execute format('grant select on public.%I to authenticated',relation);
  execute format('create policy finance_admin_read on public.%I for select to authenticated using ((select public.is_admin()))',relation);
 end loop;
end $$;
