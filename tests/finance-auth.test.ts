import {expect,it} from 'vitest';
import {authInput} from '../admin/app/finance/auth/input';
import {admin,applicant,customer,financeDatabase,financeSeed,identity} from './finance-db-fixture';

it('validates signup data and enforces password confirmation and byte limits',()=>{
 const form={action:'signup',name:'  Finance Member ',email:'MEMBER@EXAMPLE.TEST',password:'Long-secure-password-7',
  confirmation:'Long-secure-password-7'};
 expect(authInput.parse(form)).toMatchObject({name:'Finance Member',email:'member@example.test'});
 expect(authInput.safeParse({...form,email:'invalid-mail'}).success).toBe(false);
 expect(authInput.safeParse({...form,password:'weak',confirmation:'weak'}).success).toBe(false);
 expect(authInput.safeParse({...form,confirmation:'another-password'}).success).toBe(false);
 const overlong='ก'.repeat(26)+'7';
 expect(authInput.safeParse({...form,password:overlong,confirmation:overlong}).success).toBe(false);
});

it('enforces owner-only approval, MFA, linked allocations, and immediate revocation in PostgreSQL',async()=>{
 const db=await financeDatabase();
 try {
  const sample=await financeSeed(db);
  const value=async<T>(sql:string,args:unknown[]=[])=>{
   return (await db.query<{value:T}>(sql,args)).rows[0].value;
  };
  await identity(db,applicant,'aal1');
  await expect(value("select public.finance_request_access('New Member') value")).rejects.toThrow('Confirmed sign-in required');
  await db.exec(`reset role;update auth.users set email_confirmed_at=now() where id='${applicant}'`);
  await identity(db,applicant,'aal1');
  expect(await value("select public.finance_request_access('New Member') value")).toBe('pending');
  await expect(db.query("update public.finance_memberships set role='owner'")).rejects.toThrow('permission denied');
  await expect(value('select public.finance_set_membership($1,$2,null) value',[applicant,'admin'])).rejects.toThrow('Finance owner MFA required');
  expect(await value('select count(*)::int value from public.finance_orders')).toBe(0);
  await expect(value('select public.finance_overview(current_date,current_date) value')).rejects.toThrow();
  await identity(db,admin);
  const linked=await value<string>('select member_id value from public.finance_payout_summary where id=$1',[sample.payout]);
  await expect(value('select public.finance_set_membership($1,$2,$3) value',[applicant,'team',linked])).rejects.toThrow('Finance owner MFA required');
  await db.exec(`reset role;update public.finance_memberships set role='owner' where user_id='${admin}'`);
  await identity(db,admin,'aal1');
  await expect(value('select public.finance_membership_admin(0) value')).rejects.toThrow('Finance owner MFA required');
  await identity(db,admin);
  expect(await value('select public.finance_set_membership($1,$2,$3) value',[applicant,'team',linked])).toBe(true);
  await identity(db,applicant,'aal1');
  await expect(value('select public.finance_my_allocations() value')).rejects.toThrow('Approved team MFA required');
  await identity(db,applicant);
  const shares=await value<{allocations:Record<string,unknown>[];payments:Record<string,unknown>[]}>('select public.finance_my_allocations() value');
  expect(shares.allocations).toEqual([expect.objectContaining({id:sample.payout,amount_satang:45000,paid_satang:15000})]);
  expect(shares.payments).toEqual([{id:expect.any(String),occurred_on:sample.today,amount_satang:15000}]);
  expect(shares.allocations[0]).not.toHaveProperty('distributable_satang');
  expect(await value('select count(*)::int value from public.finance_payouts')).toBe(0);
  await identity(db,customer);
  await expect(value('select public.finance_my_allocations() value')).rejects.toThrow('Approved team MFA required');
  await identity(db,admin);
  expect(await value('select public.finance_set_membership($1,$2,null) value',[applicant,'admin'])).toBe(true);
  await identity(db,applicant);
  expect(await value('select count(*)::int value from public.finance_orders')).toBeGreaterThan(0);
  expect(await value('select public.is_admin() value')).toBe(false);
  await identity(db,admin);
  expect(await value('select public.finance_set_membership($1,$2,null) value',[applicant,'revoked'])).toBe(true);
  await identity(db,applicant);
  expect(await value('select count(*)::int value from public.finance_orders')).toBe(0);
 } finally {await db.close();}
},20000);
