import {randomUUID} from 'node:crypto';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {financeDatabase,financeSeed,financeWrite,identity,admin,customer} from './finance-db-fixture';
import {calculate,period,validateSubmission} from '../admin/app/finance/model';
import {csv,excel} from '../admin/app/finance/export-files';
import type {PayoutMonth} from '../admin/app/finance/payouts';

describe('simplified monthly payouts',()=>{
 let db:PGlite;
 let sample:Awaited<ReturnType<typeof financeSeed>>;
 beforeAll(async()=>{db=await financeDatabase();sample=await financeSeed(db);});
 afterAll(async()=>db?.close());
 const page=async(month:string)=> (await db.query<{value:PayoutMonth}>(
  'select public.finance_month_payout_page($1) value',[month])).rows[0].value;
 const record=async(recipient:string,amount:number,{key=randomUUID(),month=sample.prior,date=sample.today,account=null as string|null}={})=>
  (await db.query<{value:string}>('select public.finance_record_month_payout($1,$2,$3,$4,$5,$6) value',
   [key,month,recipient,date,amount,account])).rows[0].value;

 it('shows the actual monthly net, unchanged allocations, and legacy payments',async()=>{
  const historical=await page(sample.prior);
  expect(historical).toMatchObject({net:'300000',closed:true,historyCount:1,
   history:[{recipient:'Team Member 1',amount:'15000',day:sample.today}]});
  expect(historical.recipients.map(({points,share,paid,remaining})=>[points,share,paid,remaining])).toEqual([
   [1500,'45000','15000','30000'],[1500,'45000','0','45000'],[7000,'210000','0','210000'],
  ]);
  const current=await page(sample.today.slice(0,7)+'-01');
  expect(current.closed).toBe(false);
  expect(Number(current.net)).toBeGreaterThan(0);
  expect(current.recipients.map(item=>item.points)).toEqual([1500,1500,7000]);
  expect(current.recipients.map(item=>item.share)).toEqual(['31642','31642','147666']);
  await expect(record(current.recipients[0].id,100,{month:sample.today.slice(0,7)+'-01'})).rejects.toThrow('payout:open');
 });

 it('records team partials and real owner withdrawals once without changing net profit',async()=>{
  const snapshot=await page(sample.prior);
  const member=snapshot.recipients[0].id;
  const key=randomUUID();
  await expect(record(member,30001)).rejects.toThrow('payout:balance');
  await expect(record(member,1,{date:sample.prior})).rejects.toThrow('payout:date');
  await expect(record(member,15000)).rejects.toThrow('payout:duplicate');
  const receipt=await record(member,12500,{key});
  expect(await record(member,12500,{key})).toBe(receipt);
  await expect(record(member,12501,{key})).rejects.toThrow('payout:duplicate');
  await expect(record(member,12500)).rejects.toThrow('payout:duplicate');
  expect((await page(sample.prior)).recipients[0]).toMatchObject({paid:'27500',remaining:'17500'});

  await financeWrite(db,'capital',{day:sample.today,account:sample.bank,contributor:'Owner',kind:'owner_withdrawal',amount:123});
  expect((await page(sample.prior)).recipients[2]).toMatchObject({paid:'0'});
  expect((await page(sample.today.slice(0,7)+'-01')).history).toEqual(
   [expect.objectContaining({kind:'unlinked',amount:'123'})]);
  const ownerKey=randomUUID();
  expect(await record('owner',210000,{key:ownerKey})).toBe(await record('owner',210000,{key:ownerKey}));
  const result=await page(sample.prior);
  expect(result.historyCount).toBe(3);
  expect(result.history).toEqual(expect.arrayContaining([
   expect.objectContaining({kind:'owner',amount:'210000',day:sample.today}),
   expect.objectContaining({kind:'team',id:receipt,amount:'12500',day:sample.today}),
  ]));
  expect(result.recipients[2]).toMatchObject({share:'210000',paid:'210000',remaining:'0'});
  expect(result.net).toBe(snapshot.net);
  await expect(financeWrite(db,'allocation_adjust',{target:sample.payout,amount:1,notes:'Reallocate owner share'})).rejects.toThrow('below recorded withdrawals');
  expect((await db.query("select kind,amount_satang from public.finance_cash_entries where kind='owner_withdrawal' and amount_satang=-210000")).rows)
   .toEqual([{kind:'owner_withdrawal',amount_satang:-210000}]);
 });

 it('denies pending and AAL1 access and produces no positive payable balance in a losing or empty period',async()=>{
  await identity(db,customer,'aal2');
  await expect(page(sample.prior)).rejects.toThrow('Finance admin MFA');
  await identity(db,admin,'aal1');
  await expect(record('owner',1)).rejects.toThrow('Finance admin MFA');
  await identity(db);
  expect((await page('2000-01-01')).recipients.every(item=>item.share==='0')).toBe(true);
  await financeWrite(db,'expense',{day:sample.today,category:sample.packaging,description:'Loss fixture',amount:1000000});
  const loss=await page(sample.today.slice(0,7)+'-01');
  expect(Number(loss.net)).toBeLessThan(0);
  expect(loss.recipients.every(item=>item.share==='0'&&item.remaining==='0')).toBe(true);
 });
});

it('records one payment against multiple finalized per-order allocations and shows one receipt',async()=>{
 const db=await financeDatabase();
 try {
  await identity(db);
  const [{id:member}]=(await db.query<{id:string}>('select id from public.finance_members order by name')).rows;
  const [{id:category}]=(await db.query<{id:string}>("select id from public.finance_categories where kind='sale' limit 1")).rows;
  const month='2026-01-01';
  await financeWrite(db,'agreement',{day:month,basis:'net',method:'per_order',members:[{member,points:1500}]});
  for(const reference of ['ORDER-01','ORDER-02']){
   const target=await financeWrite(db,'order',{day:month,reference,customer:'Fixture',lines:[
    {category,description:'Fixture print',quantity:1,unit:10000,discount:0,fee:0},
   ]});
   await financeWrite(db,'recognize',{day:month,target});
  }
  await financeWrite(db,'close',{day:month});
  const receipt=randomUUID();
  await db.query('select public.finance_record_month_payout($1,$2,$3,$4,2500)',[receipt,month,member,'2026-01-31']);
  expect((await db.query("select amount_satang from public.finance_payouts order by amount_satang")).rows)
   .toEqual([{amount_satang:1000},{amount_satang:1500}]);
  const [{value}]=(await db.query<{value:PayoutMonth}>('select public.finance_month_payout_page($1) value',[month])).rows;
  expect(value).toMatchObject({net:'20000',historyCount:1,history:[{id:receipt,amount:'2500',kind:'team'}],
   recipients:[{id:member,share:'3000',paid:'2500',remaining:'500'},{id:'owner',share:'17000',paid:'0'}]});

  const losingMonth='2026-02-01';
  const target=await financeWrite(db,'order',{day:losingMonth,reference:'ORDER-03',customer:'Fixture',lines:[
   {category,description:'Fixture print',quantity:1,unit:5000,discount:0,fee:0},
  ]});
  await financeWrite(db,'recognize',{day:losingMonth,target});
  const [{id:expenseCategory}]=(await db.query<{id:string}>("select id from public.finance_categories where kind='expense' limit 1")).rows;
  await financeWrite(db,'expense',{day:losingMonth,category:expenseCategory,description:'Loss fixture',amount:10000,eligible:false});
  await financeWrite(db,'close',{day:losingMonth});
  await expect(db.query('select public.finance_record_month_payout($1,$2,$3,$4,750)',
   [randomUUID(),losingMonth,member,'2026-02-28'])).rejects.toThrow('payout:profit');
 } finally {await db.close();}
});

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
 it('posts manual income once to cash and profit and rolls back failed submissions',async()=>{
  const submit=(key:string,data:object)=>db.query<{id:string}>(
   'select public.finance_record_income($1,$2::jsonb) id',[key,JSON.stringify(data)]);
  const request={day:sample.today,category:sample.sales,account:sample.cash,description:'Direct income',amount:12525};
  await identity(db,customer);
  await expect(submit(randomUUID(),request)).rejects.toThrow('Finance admin MFA');
  await identity(db);
  const overview=async()=> (await db.query<{value:Record<string,number>}>(
   'select public.finance_overview($1,$1) value',[sample.today])).rows[0].value;
  const before=await overview();
  const key=randomUUID();
  const saved=(await submit(key,request)).rows[0].id;
  expect((await submit(key,request)).rows[0].id).toBe(saved);
  await expect(submit(key,{...request,amount:1})).rejects.toThrow('Request key already used');
  const failed=randomUUID();
  await expect(submit(failed,{...request,account:randomUUID()})).rejects.toThrow();
  expect((await db.query('select id from public.finance_orders where id=$1',[failed])).rows).toHaveLength(0);
  expect((await db.query('select amount_satang,notes from public.finance_payment_register where id=$1',[saved])).rows)
   .toEqual([{amount_satang:12525,notes:'Direct income'}]);
  const after=await overview();
  expect(after.revenue-before.revenue).toBe(12525);
  expect(after.cash-before.cash).toBe(12525);
  expect(after.net-before.net).toBe(12525);
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
