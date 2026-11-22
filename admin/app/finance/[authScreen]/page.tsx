import {financePreferences} from '../preferences';
import {FinanceSecurity} from '../passkeys';
import {notFound,redirect} from 'next/navigation';
import Link from 'next/link';
import {FinanceAuthFrame,FinanceLogin,FinanceSignOut,type AuthScreen} from '../login/screen';
import {financeAccess,financeDestination,isApproved} from '../membership';
import {canRecover} from '../auth/flow';
import {thb} from '../model';
import '../finance.css';

export const metadata={title:'Memo Finance Account',robots:{index:false,follow:false}};
type TeamData={allocations:{id:string;month:string;amount_satang:number;adjustment_satang:number;paid_satang:number;remaining_satang:number}[];
 payments:{id:string;occurred_on:string;amount_satang:number}[]};
const screens=['signup','forgot-password','reset-password','verify','pending','team-access'];

export default async function FinanceAccountPage({params,searchParams}:{params:Promise<{authScreen:string}>;searchParams:Promise<{result?:string}>}) {
 const [{authScreen},query,{locale}]=await Promise.all([params,searchParams,financePreferences()]);
 if(!screens.includes(authScreen))notFound();
 const thai=locale==='th';
 const l=(en:string,th:string)=>thai?th:en;
 if(authScreen==='pending'||authScreen==='team-access'||authScreen==='reset-password'){
  const access=await financeAccess();
  if(authScreen==='reset-password'){
   const valid=access&&await canRecover(access.claims.session_id);
   if(!valid)return <FinanceAuthFrame thai={thai}><h1>{l('Reset password','ตั้งรหัสผ่านใหม่')}</h1>
    <p className="finance-auth-message">{l('Request a new password reset link to continue.','ขอลิงก์ตั้งรหัสผ่านใหม่เพื่อดำเนินการต่อ')}</p>
    <Link className="finance-button primary" href="/finance/forgot-password">{l('Request reset link','ขอลิงก์ตั้งรหัสผ่าน')}</Link></FinanceAuthFrame>;
  }else{
   if(!access)redirect('/finance/login');
   if(authScreen==='pending'){
    if(isApproved(access.role))redirect(financeDestination(access));
    return <FinanceLogin screen="pending" thai={thai} requested={access.role!=='unassigned'}/>;
   }
   if(access.role!=='team'||!access.mfa)redirect(financeDestination(access));
   const {data,error}=await access.db.rpc('finance_my_allocations' as never);
   if(error)throw Error('Team shares could not be loaded');
   const rows=data as unknown as TeamData;
   const money=(value:number)=>thb(value,thai?'th':'en');
   return <FinanceAuthFrame thai={thai}>
    <h1>{l('Your profit shares','ส่วนแบ่งกำไรของคุณ')}</h1>
    {rows.allocations.length?<ul className="finance-email-history">{rows.allocations.map(row=><li key={row.id}>
     <div><strong>{row.month.slice(0,7)}</strong>
      <small>{l('Allocation','ส่วนแบ่ง')} {money(row.amount_satang+row.adjustment_satang)} · {l('Paid','จ่ายแล้ว')} {money(row.paid_satang)}</small></div>
     <span>{l('Remaining','คงเหลือ')} {money(row.remaining_satang)}</span>
    </li>)}</ul>:<p>{l('You have no recorded allocations yet.','ยังไม่มีส่วนแบ่งที่บันทึก')}</p>}
    {rows.payments.length>0&&<><h2>{l('Payment history','ประวัติการจ่าย')}</h2>
     <ul className="finance-email-history">{rows.payments.map(row=><li key={row.id}>
      <time dateTime={row.occurred_on}>{row.occurred_on}</time><strong>{money(row.amount_satang)}</strong></li>)}</ul></>}
    <FinanceSignOut thai={thai}/>
    <FinanceSecurity thai={thai}/>
   </FinanceAuthFrame>;
  }
 }
 return <FinanceLogin thai={thai} screen={authScreen as AuthScreen} result={query.result}/>;
}
