import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';

export const admin='33333333-3333-4333-8333-333333333333';
export const customer='44444444-4444-4444-8444-444444444444';
export const session='55555555-5555-4555-8555-555555555555';
export const applicant='66666666-6666-4666-8666-666666666666';
export const applicantSession='77777777-7777-4777-8777-777777777777';

export async function financeDatabase() {
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users,not_after timestamptz);
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 grant usage on schema public,auth to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;`);
 for(const file of readdirSync('supabase/migrations').sort()){
  if(file.startsWith('202611220026')){
   await db.exec(`insert into auth.users values('${admin}','admin@example.test',now()),('${customer}','customer@example.test',now()),
   ('${applicant}','applicant@example.test',null);insert into public.roles values('${admin}','admin');
   insert into auth.sessions(id,user_id) values('${session}','${admin}'),('${applicantSession}','${applicant}');`);
  }
  await db.exec(readFileSync('supabase/migrations/'+file,'utf8').replace('create extension if not exists pgcrypto;',''));
 }
 return db;
}
export async function identity(db:PGlite,user=admin,aal='aal2') {
 await db.exec('reset role');
 await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[user,JSON.stringify({aal})]);
 await db.exec('set role authenticated');
}
export async function financeWrite(db:PGlite,action:string,data:Record<string,unknown>,key=randomUUID()) {
 return (await db.query<{id:string}>('select public.finance_write($1,$2,$3::jsonb) id',[action,key,JSON.stringify(data)])).rows[0].id;
}

export async function financeSeed(db:PGlite) {
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format();
 const month=new Date(today.slice(0,7)+'-01T00:00:00Z');
 month.setUTCMonth(month.getUTCMonth()-1);
 const prior=month.toISOString().slice(0,10);
 await identity(db);
 const accounts=(await db.query<{id:string;name:string}>('select * from public.finance_accounts')).rows;
 const categories=(await db.query<{id:string;name:string}>('select * from public.finance_categories')).rows;
 const id=(items:{id:string;name:string}[],name:string)=>items.find(item=>item.name===name)!.id;
 const bank=id(accounts,'Bank'),cash=id(accounts,'Cash'),promptpay=id(accounts,'PromptPay');
 const sales=id(categories,'Basic 3D printing'),packaging=id(categories,'Packaging'),electricity=id(categories,'Electricity');
 const order=(day:string,reference:string,description:string,price:string)=>financeWrite(db,'order',{day,reference,customer:'Synthetic customer',
  lines:[{category:sales,description,quantity:1,unit:price,discount:0,fee:0}]});
 const historical=await order(prior,'DEMO-001','RIDE HIGH logo print','400000');
 await financeWrite(db,'payment',{day:prior,target:historical,account:bank,kind:'receipt',amount:400000,notes:'RIDE HIGH logo print'});
 await financeWrite(db,'recognize',{day:prior,target:historical});
 await financeWrite(db,'expense',{day:prior,category:electricity,description:'Printer electricity',amount:100000,account:bank});
 await financeWrite(db,'close',{day:prior});
 const payouts=(await db.query<{id:string}>('select id from public.finance_payout_summary where member_id is not null order by name_snapshot')).rows;
 await financeWrite(db,'payout',{day:today,target:payouts[0].id,account:bank,amount:15000,notes:'Team payment'});
 const current=await order(today,'DEMO-002','QR keychain order','225000');
 await financeWrite(db,'payment',{day:today,target:current,account:promptpay,kind:'receipt',amount:225000,notes:'QR keychain order'});
 await financeWrite(db,'recognize',{day:today,target:current});
 await order(today,'DEMO-003','Workshop nameplates','165000');
 await financeWrite(db,'expense',{day:today,category:packaging,description:'Packaging for keychains',amount:14050,account:cash});
 await financeWrite(db,'capital',{day:today,account:bank,contributor:'Owner',kind:'owner_contribution',amount:3500000});
 await financeWrite(db,'asset',{day:today,account:bank,description:'Creality K2',amount:2400000,salvage:0,months:36});
 const spool=await financeWrite(db,'spool',{day:today,account:cash,material:'PETG',color:'White',brand:'Creality',gross:1200,tare:200,amount:50000});
 await financeWrite(db,'spool',{day:today,account:cash,material:'PETG',color:'Black',brand:'Creality',gross:1220,tare:220,amount:57000});
 await db.query("select public.finance_save_goal($1,0,'New print station',1800000,720000,null)",[randomUUID()]);
 return {today,prior,bank,cash,promptpay,sales,packaging,historical,current,spool,payout:payouts[0].id};
}
