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

const manualPayout=z.object({
 key:z.uuid(),recipient:z.union([z.literal('owner'),z.uuid()]),date:day,
 amount:money.refine(value=>Number(value)>0),confirm:z.string().regex(/^\d{1,11}$/).optional(),
});
export async function recordManualPayout(input:unknown):Promise<
 {status:'saved'}|{status:'confirm';available:string;excess:string}|{status:'error';error:string}
> {
 const context=await authorization();
 if(!context)return {status:'error',error:'authorization'};
 const parsed=manualPayout.safeParse(input);
 if(!parsed.success)return {status:'error',error:'invalid'};
 const {key,recipient,date,amount,confirm}=parsed.data;
 const {data,error}=await context.db.rpc('finance_record_manual_payout' as never,{
  p_key:key,p_recipient:recipient,p_day:date,p_amount:amount,p_confirm_limit:confirm??null,
 } as never);
 if(error){
  if(error.code==='P0001'&&error.message.startsWith('payout:'))return {status:'error',error:error.message.slice(7)};
  console.error('Manual payout failed',{code:error.code});
  return {status:'error',error:'retry'};
 }
 const result=data as unknown as {status:string;available:string;excess:string}|null;
 if(result?.status==='confirm')return {status:'confirm',available:result.available,excess:result.excess};
 if(result?.status!=='saved')return {status:'error',error:'retry'};
 revalidatePath('/finance');
 return {status:'saved'};
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
