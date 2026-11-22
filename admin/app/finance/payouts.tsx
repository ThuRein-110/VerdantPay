'use client';

import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {payoutName,thb,type L} from './model';
import {recordManualPayout} from './actions';

export type PayoutRecipient={id:string;name:string;points:number|null;share:string;paid:string;remaining:string};
export type PayoutMonth={
 net:string;closed:boolean;frozen:boolean;canClose:boolean;requiredCloseMonth:string|null;recipients:PayoutRecipient[];
 history:{id:string;day:string;recipient:string;amount:string;kind:'team'|'owner'|'unlinked'}[];
 historyCount:number;
};
export type ManualPayoutData={
 recipients:{id:string;name:string}[];
 history:{id:string;day:string;recipient:string;amount:string;excess:string}[];
 count:number;
};

const errors:Record<string,[string,string]>={
 invalid:['Choose a recipient and enter a positive amount with up to two decimal places.','เลือกผู้รับและกรอกจำนวนเงินมากกว่าศูนย์ โดยมีทศนิยมไม่เกินสองตำแหน่ง'],
 date:['Choose a valid payment date no later than today.','เลือกวันที่จ่ายที่ถูกต้องและไม่เกินวันนี้'],
 duplicate:['A payout for this recipient, date, and amount is already recorded.','มีรายการจ่ายให้ผู้รับรายนี้ในวันที่และจำนวนเงินเดียวกันแล้ว'],
 recipient:['Choose an existing recipient.','เลือกผู้รับจากรายการ'],
 account:['The default Cash account is unavailable.','บัญชีเงินสดเริ่มต้นไม่พร้อมใช้งาน'],
 authorization:['Sign in again with your authenticator to record a payout.','เข้าสู่ระบบและยืนยันตัวตนอีกครั้งเพื่อบันทึกการจ่าย'],
 retry:['The payout could not be confirmed. Try again using this form.','ยืนยันการจ่ายไม่ได้ กรุณาลองอีกครั้งด้วยแบบฟอร์มนี้'],
};

export function ManualPayoutForm({recipients,today,thai}:{recipients:ManualPayoutData['recipients'];today:string;thai:boolean}) {
 const l:L=(en,th)=>thai?th:en;
 const locale=thai?'th':'en';
 const form=useRef<HTMLFormElement>(null);
 const attempt=useRef<{key:string;payload:string}>(null);
 const sending=useRef(false);
 const router=useRouter();
 const [pending,setPending]=useState(false);
 const [error,setError]=useState('');
 const [saved,setSaved]=useState(false);
 const [warning,setWarning]=useState<{available:string;excess:string}|null>(null);
 async function submit(confirm?:string){
  if(sending.current||!form.current?.reportValidity())return;
  const fields=new FormData(form.current);
  const input={recipient:String(fields.get('recipient')),date:String(fields.get('date')),amount:String(fields.get('amount'))};
  const payload=JSON.stringify(input);
  if(attempt.current?.payload!==payload)attempt.current={key:crypto.randomUUID(),payload};
  sending.current=true;setPending(true);setError('');setSaved(false);
  try {
   const result=await recordManualPayout({...input,key:attempt.current.key,confirm});
   if(result.status==='confirm'){setWarning(result);return;}
   if(result.status==='error'){setWarning(null);setError(l(...(errors[result.error]??errors.retry)));return;}
   form.current?.reset();attempt.current=null;setWarning(null);setSaved(true);router.refresh();
  } catch {setError(l(...errors.retry));}
  finally{sending.current=false;setPending(false);}
 }
 return <section className="finance-panel" aria-label={l('Record a payout','บันทึกการจ่ายส่วนแบ่ง')}>
  <form ref={form} className="finance-form finance-manual-payout" onChange={()=>{setWarning(null);setError('');setSaved(false);}}
   onSubmit={event=>{event.preventDefault();if(!warning)void submit();}}>
   <div className="finance-fields">
    <label>{l('Team Member','สมาชิกทีม')}<select name="recipient" defaultValue="" required disabled={pending}>
     <option value="" disabled>{l('Select a recipient','เลือกผู้รับ')}</option>
     {recipients.map(({id,name})=><option value={id} key={id}>{payoutName(name,thai)}
      {id==='owner'&&name!=='Owner'?' · '+l('Owner','เจ้าของ'):''}</option>)}
    </select></label>
    <label>{l('Amount (THB)','จำนวนเงิน (บาท)')}<input type="number" name="amount" inputMode="decimal" min="0.01"
     max="999999999.99" step="0.01" required disabled={pending}/></label>
    <label>{l('Payment Date','วันที่จ่าย')}<input type="date" name="date" min="2000-01-01" max={today} defaultValue={today}
     required disabled={pending}/></label>
   </div>
   {warning&&<div className="finance-payout-warning" role="alert">
    <strong>{l('This payout exceeds the unpaid allocation.','การจ่ายครั้งนี้เกินยอดส่วนแบ่งค้างจ่าย')}</strong>
    <p>{l('Available unpaid allocation','ยอดส่วนแบ่งค้างจ่าย')} {thb(warning.available,locale)} · {l('Excess','ยอดเกิน')} {thb(warning.excess,locale)}</p>
    <p>{l('Confirm to record the full amount. The excess will remain outside profit allocations.','ยืนยันเพื่อบันทึกเต็มจำนวน ยอดเกินจะไม่รวมในส่วนแบ่งกำไร')}</p>
   </div>}
   {error&&<p className="finance-error" role="alert">{error}</p>}
   {saved&&<p role="status">{l('Payout recorded.','บันทึกการจ่ายแล้ว')}</p>}
   <div className="finance-submit">
    {warning?<><button type="button" className="finance-button primary" disabled={pending} onClick={()=>void submit(warning.available)}>
     {pending?l('Saving…','กำลังบันทึก…'):l('Confirm payout above allocation','ยืนยันการจ่ายเกินส่วนแบ่ง')}</button>
     <button type="button" className="finance-button" disabled={pending} onClick={()=>setWarning(null)}>{l('Cancel','ยกเลิก')}</button></>:
     <button className="finance-button primary" disabled={pending}>{pending?l('Saving…','กำลังบันทึก…'):l('Record Payout','บันทึกการจ่าย')}</button>}
   </div>
  </form>
 </section>;
}

export function PayoutCards({data,thai}:{data:PayoutMonth;thai:boolean}) {
 const l:L=(en,th)=>thai?th:en,locale=thai?'th':'en';
 const percent=new Intl.NumberFormat(locale,{style:'percent',maximumFractionDigits:2});
 return <div className="finance-team-cards">
  {data.recipients.map(({id,name,points,share,paid,remaining})=>{
   const owner=id==='owner';
   const state=Number(paid)>0?(Number(remaining)>0?'partial':'paid'):'unpaid';
   const label=state==='paid'?l('Paid','จ่ายแล้ว'):state==='partial'?l('Partially Paid','จ่ายบางส่วน'):l('Unpaid','ยังไม่จ่าย');
   return <article className="finance-panel finance-team-card finance-payout-card" key={id}>
    <header><div><h3>{payoutName(name,thai)}</h3>{points!==null&&<p>{percent.format(points/10000)}</p>}</div>
     {Number(share)>0&&<span className={`finance-state state-${state}`}>{label}</span>}</header>
    <dl>
     <div><dt>{data.closed?l('Allocated','จัดสรรแล้ว'):l('Estimated allocation','ประมาณการส่วนแบ่ง')}</dt><dd>{thb(share,locale)}</dd></div>
     <div><dt>{owner?l('Withdrawn','ถอนแล้ว'):l('Total paid','จ่ายแล้วทั้งหมด')}</dt><dd>{thb(paid,locale)}</dd></div>
     <div><dt>{owner?l('Remaining to withdraw','ยอดคงเหลือที่ถอนได้'):l('Remaining unpaid','ยอดค้างจ่าย')}</dt><dd>{thb(remaining,locale)}</dd></div>
    </dl>
   </article>;
  })}
 </div>;
}
