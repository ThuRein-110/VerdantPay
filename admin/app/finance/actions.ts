'use server';

import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import {authorization,rows} from './data';
import {bangkokToday,thb,validateSubmission} from './model';
import {definitions,type Lookups} from './forms';
import {financeLookups} from './lookups';
import {quickTypes,type QuickType} from './quick-types';

const quickLookups:Record<QuickType,(keyof Lookups)[]>={
 income:['accounts','sales'],expense:['accounts','expenses','orders'],investment:['accounts','assets'],payout:['accounts'],
};

export async function loadQuickEntry(type:QuickType,thai:boolean) {
 const context=await authorization();
 if(!context||!Object.hasOwn(quickTypes,type)) return {error:thai?'กรุณาเข้าสู่ระบบผู้ดูแล':'Administrator sign-in is required.'};
 const l=(en:string,th:string)=>thai?th:en;
 try {
  const [lists,allocations]=await Promise.all([
   financeLookups(context.db,quickLookups[type]),
   type==='payout'?rows(context.db,'finance_payout_summary',{sort:'month',size:1000}):null,
  ]);
  const {sectionForms,rowForms}=definitions(l,lists,bangkokToday());
  if(type==='income') return {form:sectionForms.income?.[0]};
  if(type==='expense') return {form:sectionForms.expenses?.[0]};
  if(type==='investment') return {form:sectionForms.investments?.[0]};
  const eligible=allocations?.data.filter(row=>row.member_id&&Number(row.remaining_satang)>0)??[];
  const base=eligible.length?rowForms.allocations(eligible[0])[0]:null;
  if(!base) return {message:l('There are no unpaid team allocations.','ไม่มีส่วนแบ่งทีมค้างจ่าย')};
  return {form:{...base,fields:[{key:'target',label:l('Team allocation','รายการส่วนแบ่ง'),type:'select' as const,
   list:eligible.map(row=>({value:String(row.id),label:row.name_snapshot+' · '+row.month+' · '+thb(row.remaining_satang,thai?'th':'en')}))},...base.fields]}};
 } catch {
  return {error:l('Could not load the record form. Try again.','โหลดแบบฟอร์มไม่ได้ กรุณาลองใหม่')};
 }
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
