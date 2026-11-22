'use server';

import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import {authorization} from './data';
import {bangkokToday,day,money,validateSubmission} from './model';
import {definitions,type Form,type Lookups} from './forms';
import {financeLookups} from './lookups';
import {quickTypes,type QuickType} from './quick-types';

const quickLookups:Record<QuickType,(keyof Lookups)[]>={
 income:['accounts','sales'],expense:['accounts','expenses','orders'],investment:['accounts','assets'],payout:['accounts'],
};

export async function loadQuickEntry(type:QuickType,thai:boolean):Promise<{form?:Form;error?:string;href?:string}> {
 const context=await authorization();
 if(!context||!Object.hasOwn(quickTypes,type)) return {error:thai?'กรุณาเข้าสู่ระบบผู้ดูแล':'Administrator sign-in is required.'};
 const l=(en:string,th:string)=>thai?th:en;
 try {
  if(type==='payout') return {href:'/finance?section=team'};
  const lists=await financeLookups(context.db,quickLookups[type]);
  const {sectionForms}=definitions(l,lists,bangkokToday());
  if(type==='income') return {form:sectionForms.income?.[0]};
  if(type==='expense') return {form:sectionForms.expenses?.[0]};
  return {form:sectionForms.investments?.[0]};
 } catch {
  return {error:l('Could not load the record form. Try again.','โหลดแบบฟอร์มไม่ได้ กรุณาลองใหม่')};
 }
}

const monthPayout=z.object({
 key:z.uuid(),month:day,recipient:z.union([z.literal('owner'),z.uuid()]),date:day,
 amount:money.refine(value=>Number(value)>0),account:z.union([z.literal(''),z.uuid()]),notes:z.string().trim().max(1000),
});
export async function recordMonthPayout(input:unknown) {
 const context=await authorization();
 if(!context)return {error:'authorization'};
 const parsed=monthPayout.safeParse(input);
 if(!parsed.success)return {error:'invalid'};
 const {key,month,recipient,date,amount,account,notes}=parsed.data;
 const {error}=await context.db.rpc('finance_record_month_payout' as never,{
  p_key:key,p_month:month,p_recipient:recipient,p_day:date,p_amount:amount,p_account:account||null,p_notes:notes||null,
 } as never);
 if(error){
  if(error.code==='P0001'&&error.message.startsWith('payout:'))return {error:error.message.slice(7)};
  console.error('Monthly payout failed',{code:error.code});
  return {error:'retry'};
 }
 revalidatePath('/finance');
 return {saved:true};
}

export async function submitFinance(action: string, requestKey: string, values: unknown) {
 const context = await authorization();
 if(!context) return {error:'Administrator sign-in and verified MFA are required.'};
 try {
  const key = z.uuid().parse(requestKey);
  const data = validateSubmission(action,values);
  const {error} = action==='manual_income'
   ?await context.db.rpc('finance_record_income' as never,{p_key:key,p_data:data} as never)
   :await context.db.rpc('finance_write' as never,{p_action:action,p_key:key,p_data:data} as never);
  if(error) {
   if(error.code==='P0001') return {error:error.message};
   if(error.code==='23505') return {error:'A matching record already exists.'};
   if(['22003','22007','22P02','23502','23503','23514','P0002'].includes(error.code)) {
    return {error:'Check the selected records, dates, values and required fields.'};
   }
   console.error('Finance write failed', {action, code:error.code});
   return {error:'The change could not be saved. Retry using the same form.'};
  }
  revalidatePath('/finance');
  return {saved:true};
 } catch (error) {
  if(error instanceof z.ZodError) return {error:'Check the format of: '+error.issues.map(issue=>issue.path.join('.')).join(', ')};
  return {error:'The submission could not be saved.'};
 }
}
