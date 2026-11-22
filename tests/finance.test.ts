import {randomUUID} from 'node:crypto';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {financeDatabase,financeSeed,financeWrite,identity,admin,customer} from './finance-db-fixture';
import {calculate,period,validateSubmission} from '../admin/app/finance/model';
import {csv,excel} from '../admin/app/finance/export-files';

describe('finance ledger',()=>{
 let db:PGlite;
 let sample:Awaited<ReturnType<typeof financeSeed>>;
 beforeAll(async()=>{db=await financeDatabase();sample=await financeSeed(db);});
 afterAll(async()=>db?.close());
 it('isolates rows from public customers and requires an administrator at AAL2',async()=>{
  await db.exec('reset role;set role anon');
  await expect(db.query('select * from public.finance_order_summary')).rejects.toThrow('permission denied');
  await identity(db,customer);
  expect((await db.query('select * from public.finance_order_summary')).rows).toHaveLength(0);
  expect((await db.query('select * from public.finance_goals')).rows).toHaveLength(0);
  await expect(db.query('select public.finance_save_goal($1,0,$2,100,0,null)',[randomUUID(),'Unauthorized'])).rejects.toThrow('Finance admin MFA');
  await expect(db.query('select public.finance_overview($1,$2)',[sample.prior,sample.today])).rejects.toThrow('Finance admin MFA');
  await identity(db,admin,'aal1');
  await expect(financeWrite(db,'account',{description:'Forbidden'})).rejects.toThrow('Finance admin MFA');
  await identity(db);
  await expect(db.query("insert into public.finance_accounts(name) values('Direct')")).rejects.toThrow('permission denied');
 });
 it('makes goals idempotent and rejects stale progress updates',async()=>{
  await identity(db);
  const id=randomUUID();
  const save=(version:number,amount:number)=>db.query<{saved:boolean}>(
   "select public.finance_save_goal($1,$2,'Maintenance reserve',10000,$3,null) as saved",[id,version,amount]);
  expect((await save(0,2000)).rows[0].saved).toBe(true);
  expect((await save(0,2000)).rows[0].saved).toBe(false);
  expect((await save(1,10000)).rows[0].saved).toBe(true);
  expect((await save(1,5000)).rows[0].saved).toBe(false);
  expect((await db.query('select completed from public.finance_goals where id=$1',[id])).rows[0]).toEqual({completed:true});
 });
 it('reconciles the 15/15/70 close and a partial payout',async()=>{
  const r=await db.query<{name_snapshot:string;amount_satang:number;paid_satang:number;remaining_satang:number}>(
   'select name_snapshot,amount_satang,paid_satang,remaining_satang from public.finance_payout_summary order by name_snapshot');
  expect(r.rows.map(row=>[row.name_snapshot,Number(row.amount_satang),Number(row.paid_satang),Number(row.remaining_satang)]))
   .toEqual([['Owner',210000,0,210000],['Team Member 1',45000,15000,30000],['Team Member 2',45000,0,45000]]);
  await expect(financeWrite(db,'payout',{day:sample.today,target:sample.payout,account:sample.bank,amount:30001})).rejects.toThrow('exceeds');
 });
 it('deducts actual mixed consumption and failed grams once and restores the stock on reversal',async()=>{
  const job=await financeWrite(db,'job',{target:sample.current,printer:'Creality K2',estimate:{},amount:9000});
  const key=randomUUID();
  const request={day:sample.today,target:job,amount:1500,actual:{},materials:[
   {spool:sample.spool,kind:'model',grams:'150'},{spool:sample.spool,kind:'failed',grams:'30'}]};
  expect(await financeWrite(db,'finalize',request,key)).toBe(job);
  expect(await financeWrite(db,'finalize',request,key)).toBe(job);
  await expect(financeWrite(db,'finalize',request)).rejects.toThrow('already finalized');
  const stock=()=>db.query<{remaining_grams:string;satang_per_gram:string;material_satang:number}>(
   'select remaining_grams,satang_per_gram,material_satang from public.finance_stock cross join public.finance_job_summary j where finance_stock.id=$1 and j.id=$2',[sample.spool,job]);
  const first=(await stock()).rows[0];
  expect([Number(first.remaining_grams),Number(first.satang_per_gram),Number(first.material_satang)]).toEqual([820,50,9000]);
  await financeWrite(db,'reverse_job',{day:sample.today,target:job,notes:'Correct material entry'});
  expect(Number((await stock()).rows[0].remaining_grams)).toBe(1000);
 });
 it('books refunds separately and transfers preserve total cash and profit',async()=>{
  const snapshot=async()=> (await db.query<{stats:Record<string,number>}>('select public.finance_overview($1,$2) stats',[sample.today,sample.today])).rows[0].stats;
  const before=await snapshot();
  const request={day:sample.today,account:sample.bank,target:sample.cash,amount:9000};
  const key=randomUUID();
  await financeWrite(db,'transfer',request,key);
  await financeWrite(db,'transfer',request,key);
  expect(await snapshot()).toMatchObject({cash:before.cash,net:before.net,revenue:before.revenue});
  await financeWrite(db,'payment',{day:sample.today,target:sample.current,account:sample.promptpay,kind:'refund',amount:5000,notes:'Partial refund'});
  expect(await snapshot()).toMatchObject({cash:before.cash-5000,net:before.net-5000,revenue:before.revenue-5000,received:before.received-5000});
  const result=await db.query<{outstanding_satang:number}>('select outstanding_satang from public.finance_order_summary where id=$1',[sample.current]);
  expect(Number(result.rows[0].outstanding_satang)).toBe(0);
 });
 it('preserves closed rates, rejects historical edits, and records auditable balanced adjustments',async()=>{
  const before=(await db.query('select * from public.finance_payout_summary order by id')).rows;
  await financeWrite(db,'agreement',{day:sample.today,basis:'net',method:'monthly',members:[]});
  expect((await db.query('select * from public.finance_payout_summary order by id')).rows).toEqual(before);
  await expect(financeWrite(db,'expense',{day:sample.prior,category:sample.packaging,description:'Old bill',amount:100})).rejects.toThrow('closed');
  await financeWrite(db,'allocation_adjust',{target:sample.payout,amount:-2500,notes:'Manual adjustment'});
  const {rows}=await db.query<{total:string}>('select sum(amount_satang)::text total from public.finance_allocations');
  expect(rows[0].total).toBe('300000');
 });
});
it('parses Thai baht without binary rounding and calculates an exact filament quote',()=>{
 const input={printer:'Creality K2',material:'PETG',color:'White',grams:'150',ratePerGram:'0.50',hours:'0',watts:'0',electricityRate:'0',
  laborHours:'0',laborRate:'0',wear:'0',packaging:'0',delivery:'0',failed:'0',margin:'30',selling:'100'};
 expect(calculate(input)).toMatchObject({filament:'7500',total:'7500',recommended:'10715',actual:'2500'});
 expect(()=>validateSubmission('job',{target:'not-an-order',estimate:input})).toThrow();
 expect(period({range:'week'},'2026-11-22')).toEqual({range:'week',from:'2026-11-16',to:'2026-11-22'});
});
it('reconciles ฿10,000 revenue and ฿4,000 expenses through the monthly close',async()=>{
 const db=await financeDatabase();
 try {
  const day='2026-01-01';
  await identity(db);
  const {rows:[ids]}=await db.query<{bank:string;sale:string;expense:string}>(`
   select (select id from public.finance_accounts where name='Bank') bank,
    (select id from public.finance_categories where name='Basic 3D printing') sale,
    (select id from public.finance_categories where name='Electricity') expense
  `);
  const order=await financeWrite(db,'order',{
   day,reference:'QA-RECONCILIATION',customer:'Synthetic customer',
   lines:[{category:ids.sale,description:'Printing services',quantity:1,unit:1000000,discount:0,fee:0}],
  });
  await financeWrite(db,'payment',{day,target:order,account:ids.bank,kind:'receipt',amount:1000000});
  await financeWrite(db,'recognize',{day,target:order});
  await financeWrite(db,'expense',{day,category:ids.expense,description:'Operating costs',amount:400000,account:ids.bank});
  await db.exec('reset role');
  const {rows:[{draft}]}=await db.query<{draft:unknown}>(
   "select public.finance_email_snapshot($1,'2026-02-01',true) draft",[day]);
  expect(draft).toMatchObject({income:'1000000',expenses:'400000',profit:'600000',allocation_status:'estimated',
   shares:[{amount:'90000'},{amount:'90000'},{owner:true,amount:'420000'}]});
  await identity(db);
  await financeWrite(db,'close',{day});
  const {rows:[{stats}]}=await db.query<{stats:Record<string,number>}>(
   'select public.finance_overview($1,$2) stats',[day,'2026-01-31']);
  expect(stats).toMatchObject({revenue:1000000,operating:400000,net:600000,team:180000,ownerAllocation:420000});
  const {rows}=await db.query<{name_snapshot:string;amount_satang:number}>(
   'select name_snapshot,amount_satang from public.finance_payout_summary order by name_snapshot');
  expect(rows.map(row=>[row.name_snapshot,Number(row.amount_satang)]))
   .toEqual([['Owner',420000],['Team Member 1',90000],['Team Member 2',90000]]);
 } finally {
  await db.close();
 }
});
it('exports readable THB and escapes formula-like CSV descriptions',async()=>{
 const data=[{name:'Expenses',columns:[{label:'Description'},{label:'Value',money:true}],rows:[['=2+2',12345]]}];
 expect(csv(data)).toContain("Description,Value (THB)\r\n'=2+2,123.45");
 expect(Array.from((await excel(data)).slice(0,4))).toEqual([80,75,3,4]);
});
