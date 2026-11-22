-- Goals record designated savings against a target. The cash ledger is independent.
create table public.finance_goals (
 id uuid primary key,
 title text not null check (char_length(btrim(title)) between 1 and 100),
 target_satang bigint not null check (target_satang between 1 and 99999999999),
 saved_satang bigint not null default 0 check (saved_satang between 0 and 99999999999),
 completed boolean generated always as (saved_satang >= target_satang) stored,
 deadline date check (deadline between '2000-01-01' and '2199-12-31'),
 version integer not null default 1 check (version > 0),
 created_at timestamptz not null default now()
);
alter table public.finance_goals enable row level security;
revoke all on public.finance_goals from public, anon, authenticated;
grant select on public.finance_goals to authenticated;
create policy finance_goals_admin_read on public.finance_goals for select to authenticated using ((select public.is_admin()));

create function public.finance_save_goal(p_id uuid, p_version integer, p_title text, p_target bigint, p_saved bigint, p_deadline date)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then
  raise exception 'Finance admin MFA required' using errcode='42501';
 end if;

 if p_version = 0 then
  insert into public.finance_goals(id,title,target_satang,saved_satang,deadline)
  values (p_id,btrim(p_title),p_target,p_saved,p_deadline)
  on conflict (id) do nothing;
 else
  update public.finance_goals
     set title=btrim(p_title),target_satang=p_target,saved_satang=p_saved,
         deadline=p_deadline,version=version+1
   where id=p_id and version=p_version;
 end if;
 return found;
end;
$$;
revoke all on function public.finance_save_goal(uuid,integer,text,bigint,bigint,date) from public, anon, authenticated;
grant execute on function public.finance_save_goal(uuid,integer,text,bigint,bigint,date) to authenticated;
