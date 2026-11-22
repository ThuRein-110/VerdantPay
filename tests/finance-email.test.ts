import {createHash,randomUUID} from 'node:crypto';
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {admin,customer,financeDatabase,financeSeed,financeWrite,identity} from './finance-db-fixture';
import {renderEmail,sendEmail,thb,type EmailJob} from '../supabase/functions/finance-email/email';

const recipient='tester@example.test';
const code='0123456789abcdef01234567';
const hash=createHash('sha256').update(code).digest('hex');
const kinds=['income','expense','investment','payout','daily','weekly','monthly','yearly'];

describe('transactional email outbox',()=>{
 let db:PGlite;
 let seed:Awaited<ReturnType<typeof financeSeed>>;
 const owner=()=>db.exec('reset role');
 const worker=()=>db.exec('reset role;set role service_role');
 beforeAll(async()=>{db=await financeDatabase();seed=await financeSeed(db);});
 afterAll(async()=>db?.close());

 it('keeps secrets private and requires an MFA administrator for settings',async()=>{
  await owner();
  await db.exec('set role anon');
  await expect(db.query('select public.finance_email_status()')).rejects.toThrow('permission denied');
  await expect(db.query('select * from public.finance_email_outbox')).rejects.toThrow('permission denied');
  await identity(db,customer,'aal2');
  await expect(db.query('select public.finance_email_status()')).rejects.toThrow('Finance admin MFA');
  await identity(db,admin,'aal1');
  await expect(db.query('select public.finance_email_test()')).rejects.toThrow('Finance admin MFA');
  await identity(db);
  await expect(db.query('select public.finance_email_request($1,$2,$3)',[recipient,code,hash])).rejects.toThrow('permission denied');
  await expect(db.query('select public.finance_email_claim($1)',[recipient])).rejects.toThrow('permission denied');
  await expect(db.query('select * from public.finance_email_preferences')).rejects.toThrow('permission denied');
 });

 it('delivers a private challenge, verifies possession, and rate-limits test requests',async()=>{
  const save=(enabled:boolean)=>db.query<{ok:boolean}>('select public.finance_email_save($1,$2::text[]) ok',[enabled,kinds]);
  await identity(db);
  expect((await save(true)).rows[0].ok).toBe(false);
  await worker();
  const request=()=>db.query<{ok:boolean}>('select public.finance_email_request($1,$2,$3) ok',[recipient,code,hash]);
  expect((await request()).rows[0].ok).toBe(true);
  expect((await request()).rows[0].ok).toBe(false);
  const claim=await db.query<{job:EmailJob}>('select public.finance_email_claim($1) job',[recipient]);
  expect(claim.rows[0].job).toMatchObject({kind:'verify',recipient,payload:{code}});
  const job=claim.rows[0].job;
  await db.query("select public.finance_email_finish($1,$2,'sent','provider-verify')",[job.id,job.lease]);
  await identity(db);
  const verify=(value:string)=>db.query<{ok:boolean}>('select public.finance_email_verify($1) ok',[value]);
  expect((await verify('incorrect')).rows[0].ok).toBe(false);
  expect((await verify(hash)).rows[0].ok).toBe(true);
  expect((await verify(hash)).rows[0].ok).toBe(false);
  expect((await save(true)).rows[0].ok).toBe(true);
  const test=()=>db.query<{ok:boolean}>('select public.finance_email_test() ok');
  expect((await test()).rows[0].ok).toBe(true);
  expect((await test()).rows[0].ok).toBe(false);
  const {rows:[{status}]}=await db.query<{status:unknown}>('select public.finance_email_status() status');
  expect(status).toMatchObject({email:recipient,enabled:true,history:[expect.objectContaining({kind:'test',state:'pending'}),expect.objectContaining({kind:'verify',state:'sent'})]});
  expect(JSON.stringify(status)).not.toContain(code);
  expect(JSON.stringify(status)).not.toContain(hash);
 });

 it('queues each committed event once and excludes rejected and rolled-back records',async()=>{
  await identity(db);
  const {rows:[{id}]}=await db.query<{id:string}>("select id from public.finance_order_summary where reference='DEMO-003'");
  const payment={day:seed.today,target:id,account:seed.bank,kind:'receipt',amount:12525};
  const key=randomUUID();
  await financeWrite(db,'payment',payment,key);
  await financeWrite(db,'payment',payment,key);
  await expect(financeWrite(db,'payment',{...payment,amount:999999})).rejects.toThrow();
  const expense={day:seed.today,category:seed.packaging,description:'Email QA expense',amount:4350,account:seed.bank};
  await db.exec('begin');
  await financeWrite(db,'expense',{...expense,description:'Rolled back'});
  await db.exec('rollback');
  await financeWrite(db,'expense',expense);
  await financeWrite(db,'capital',{day:seed.today,account:seed.bank,contributor:'Owner',kind:'owner_contribution',amount:51000});
  await financeWrite(db,'payout',{day:seed.today,target:seed.payout,account:seed.bank,amount:5000});
  await owner();
  const {rows}=await db.query("select kind,payload from public.finance_email_outbox where dedupe like 'event:%' order by kind");
  expect(rows).toEqual([
   {kind:'expense',payload:{amount:'4350',day:seed.today}},{kind:'income',payload:{amount:'12525',day:seed.today}},
   {kind:'investment',payload:{amount:'51000',day:seed.today}},{kind:'payout',payload:{amount:'5000',day:seed.today}},
  ]);
 });

 it('enqueues each Bangkok report at most once and uses recorded ledger allocations',async()=>{
  await worker();
  await db.query("select public.finance_email_tick('2027-01-01T00:59:59Z')");
  await db.query("select public.finance_email_tick('2027-01-01T01:01:00Z')");
  await db.query("select public.finance_email_tick('2027-01-01T01:31:00Z')");
  await db.query("select public.finance_email_tick('2027-01-04T01:01:00Z')");
  await owner();
  const report=await db.query<{kind:string}>("select kind from public.finance_email_outbox where dedupe like 'report:%' order by kind");
  expect(report.rows.map(row=>row.kind)).toEqual(['daily','daily','monthly','weekly','yearly']);
  const {rows:[{snapshot}]}=await db.query<{snapshot:unknown}>(
   "select public.finance_email_snapshot($1,($1::date+interval '1 month')::date,true) snapshot",[seed.prior]);
  expect(snapshot).toMatchObject({income:'400000',expenses:'100000',profit:'300000',allocation_status:'recorded',
   shares:[{name:'Team Member 1',amount:'45000'},{name:'Team Member 2',amount:'45000'},{owner:true,amount:'210000'}]});
 });

 it('claims jobs once, rejects stale acknowledgements, and pauses sending at the free-tier budget',async()=>{
  await owner();
  await db.exec("update public.finance_email_attempts set attempted_at=now()-interval '2 seconds'");
  await worker();
  const claim=()=>db.query<{job:EmailJob|null}>('select public.finance_email_claim($1) job',[recipient]);
  const job=(await claim()).rows[0].job!;
  expect(job.kind).toBe('test');
  const finish=(lease:string,result:string,id:string|null)=>db.query<{ok:boolean}>('select public.finance_email_finish($1,$2,$3,$4) ok',[job.id,lease,result,id]);
  expect((await finish(randomUUID(),'sent','invalid')).rows[0].ok).toBe(false);
  expect((await finish(job.lease,'retry',null)).rows[0].ok).toBe(true);
  const next=(await claim()).rows[0].job;
  expect(next?.id).not.toBe(job.id);
  await owner();
  await db.exec("insert into public.finance_email_attempts(lease) select gen_random_uuid() from generate_series(1,90)");
  await worker();
  expect((await claim()).rows[0].job).toBeNull();
  await owner();
  const cooldown=await db.query<{paused:boolean}>('select paused_until>now() paused from public.finance_email_preferences');
  expect(cooldown.rows[0].paused).toBe(true);
 });
});

it('renders exact THB amounts and Bangkok dates and escapes user-controlled report labels',()=>{
 expect(thb('-135050')).toBe('−฿1,350.50');
 expect(thb('900719925474099301')).toBe('฿9,007,199,254,740,993.01');
 const report=renderEmail('monthly',{from:'2026-10-01',through:'2026-10-31',income:'1000000',expenses:'400000',profit:'600000',
  allocation_status:'estimated',shares:[{name:'<img onerror=alert(1)>',amount:'90000'},{name:'Team Member 2',amount:'90000'},{owner:true,amount:'420000'}]});
 expect(report.html).toContain('1 Oct 2026');
 expect(report.html).toContain('Asia/Bangkok');
 expect(report.html).toContain('฿6,000.00');
 expect(report.html).toContain('&lt;img');
 expect(report.html).not.toContain('<img');
 expect(report.text).toContain('Owner allocation: ฿4,200.00');
 expect(report.subject).not.toContain('6,000');
 expect(renderEmail('test',{}).text).not.toContain('฿');
});

it('uses a stable Resend key, honors quota errors and retries temporary failures',async()=>{
 const job:EmailJob={id:'example-id',lease:'lease',kind:'income',recipient,payload:{amount:'10000',day:'2026-11-22'}};
 const config={apiKey:'not-real',from:'Memo <sender@example.test>'};
 const mock=vi.fn<typeof fetch>()
  .mockResolvedValueOnce(Response.json({name:'rate_limit_exceeded'},{status:429,headers:{'retry-after':'12'}}))
  .mockResolvedValueOnce(Response.json({id:'provider-accepted'}))
  .mockResolvedValueOnce(Response.json({name:'monthly_quota_exceeded'},{status:429}))
  .mockResolvedValueOnce(Response.json({id:'provider-accepted'},{headers:{'x-resend-daily-quota':'90'}}));
 expect(await sendEmail(job,config,mock)).toEqual({outcome:'retry',delay:12});
 expect(await sendEmail({...job,lease:'other-lease'},config,mock)).toEqual({outcome:'sent',providerId:'provider-accepted'});
 expect(await sendEmail(job,config,mock)).toEqual({outcome:'monthly_quota'});
 expect(await sendEmail(job,config,mock)).toEqual({outcome:'sent',providerId:'provider-accepted',pause:'daily_quota'});
 expect(mock.mock.calls[0][1]?.body).toBe(mock.mock.calls[1][1]?.body);
 expect(mock.mock.calls[1][1]?.headers).toMatchObject({'Idempotency-Key':'memo-finance/example-id'});
});
