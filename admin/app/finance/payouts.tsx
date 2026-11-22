'use client';

import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {baht,payoutName,thb,type L} from './model';
import type {Choice} from './forms';
import {recordMonthPayout} from './actions';

export type PayoutRecipient={id:string;name:string;points:number|null;share:string;paid:string;remaining:string};
export type PayoutMonth={
 net:string;closed:boolean;frozen:boolean;canClose:boolean;requiredCloseMonth:string|null;recipients:PayoutRecipient[];
 history:{id:string;day:string;recipient:string;amount:string;kind:'team'|'owner'|'unlinked'}[];
 historyCount:number;
};

const errors:Record<string,[string,string]>={
 invalid:['Enter a valid amount and payment date.','กรอกจำนวนเงินและวันที่จ่ายให้ถูกต้อง'],
 date:['Choose a date from the last day of the profit month through today.','เลือกวันที่ตั้งแต่วันสุดท้ายของเดือนกำไรถึงวันนี้'],
 balance:['The amount exceeds the remaining balance. Refresh to see the latest balance.','จำนวนเงินเกินยอดคงเหลือ รีเฟรชเพื่อดูยอดล่าสุด'],
 duplicate:['A payment for this recipient, date and amount is already recorded.','มีรายการจ่ายให้ผู้รับรายนี้ในวันที่และจำนวนเงินเดียวกันแล้ว'],
 open:['Close this profit month before recording a payment.','ปิดเดือนนี้ก่อนบันทึกการจ่าย'],
 profit:['This month has no positive net profit available for payment.','เดือนนี้ไม่มีกำไรสุทธิสำหรับจ่าย'],
 account:['Choose an available payment account.','เลือกบัญชีชำระเงินที่ใช้งานได้'],
 authorization:['Sign in again with your authenticator to record a payment.','เข้าสู่ระบบและยืนยันตัวตนอีกครั้งเพื่อบันทึกการจ่าย'],
 retry:['The payment could not be confirmed. Try again using this form.','ยืนยันการจ่ายไม่ได้ กรุณาลองอีกครั้งด้วยแบบฟอร์มนี้'],
};

export function PayoutCards({data,month,today,lastDay,accounts,thai}:{data:PayoutMonth;month:string;today:string;lastDay:string;accounts:Choice[];thai:boolean}) {
 const l:L=(en,th)=>thai?th:en,locale=thai?'th':'en';
 const percent=new Intl.NumberFormat(locale,{style:'percent',maximumFractionDigits:2});
 const [saved,setSaved]=useState(false);
 return <>{saved&&<p role="status" className="finance-panel">{l('Payment recorded.','บันทึกการจ่ายแล้ว')}</p>}<div className="finance-team-cards">
  {data.recipients.map(recipient=>{
   const {id,points,share,paid,remaining}=recipient;
   const owner=id==='owner',name=owner?l('Owner','เจ้าของ'):payoutName(recipient.name,thai);
   const state=Number(paid)>0?(Number(remaining)>0?'partial':'paid'):'unpaid';
   const label=state==='paid'?l('Paid','จ่ายแล้ว'):state==='partial'?l('Partially Paid','จ่ายบางส่วน'):l('Unpaid','ยังไม่จ่าย');
   return <article className="finance-panel finance-team-card finance-payout-card" key={id}>
    <header><div><h3>{name}</h3>{points!==null&&<p>{percent.format(points/10000)}</p>}</div>
     {Number(share)>0&&<span className={`finance-state state-${state}`}>{label}</span>}</header>
    <dl>
     <div><dt>{data.closed?l('Allocated','จัดสรรแล้ว'):l('Estimated allocation','ประมาณการส่วนแบ่ง')}</dt><dd>{thb(share,locale)}</dd></div>
     <div><dt>{owner?l('Withdrawn','ถอนแล้ว'):l('Total paid','จ่ายแล้วทั้งหมด')}</dt><dd>{thb(paid,locale)}</dd></div>
     <div><dt>{owner?l('Remaining to withdraw','ยอดคงเหลือที่ถอนได้'):l('Remaining unpaid','ยอดค้างจ่าย')}</dt><dd>{thb(remaining,locale)}</dd></div>
    </dl>
    {data.closed&&Number(data.net)>0&&Number(remaining)>0&&<PaymentForm
     key={`${month}/${remaining}`} recipient={id} name={name} thai={thai} month={month}
     today={today} lastDay={lastDay} balance={remaining} accounts={accounts} onSaved={()=>setSaved(true)}/>}
   </article>;
  })}
 </div></>;
}

function PaymentForm({recipient,name,month,today,lastDay,balance,accounts,thai,onSaved}:{
 recipient:string;name:string;month:string;today:string;lastDay:string;balance:string;accounts:Choice[];thai:boolean;onSaved:()=>void;
}) {
 const l:L=(en,th)=>thai?th:en;
 const [open,setOpen]=useState(false);
 const [pending,setPending]=useState(false);
 const [error,setError]=useState('');
 const router=useRouter();
 const attempt=useRef<{key:string;payload:string}>(null);
 const sending=useRef(false);
 return <div className="finance-payout-form">
  {open?<form className="finance-form" onSubmit={async event=>{
   event.preventDefault();
   if(sending.current)return;
   const fields=new FormData(event.currentTarget);
   const input={month,recipient,date:String(fields.get('date')),amount:String(fields.get('amount')),
    account:String(fields.get('account')??''),notes:String(fields.get('notes')??'')};
   const payload=JSON.stringify(input);
   if(attempt.current?.payload!==payload)attempt.current={key:crypto.randomUUID(),payload};
   sending.current=true;setPending(true);setError('');
   try {
    const result=await recordMonthPayout({...input,key:attempt.current.key});
    if(!result.saved){setError(l(...(errors[result.error??'retry']??errors.retry)));return;}
    attempt.current=null;setOpen(false);onSaved();
    router.refresh();
   } catch {setError(l(...errors.retry));}
   finally{sending.current=false;setPending(false);}
  }}>
   <label>{l('Recipient','ผู้รับ')}<input value={name} readOnly/></label>
   <label>{l('Amount (THB)','จำนวนเงิน (บาท)')}<input type="number" name="amount" autoFocus inputMode="decimal" required min="0.01"
    max={baht(balance)} step="0.01" defaultValue={baht(balance)}/></label>
   <label>{l('Payment date','วันที่จ่าย')}<input type="date" name="date" min={lastDay} max={today} defaultValue={today} required/></label>
   <details><summary>{l('More details','รายละเอียดเพิ่มเติม')}</summary>
    <label>{l('Payment account','บัญชีชำระเงิน')}<select name="account" defaultValue="">
     <option value="">{l('Cash (default)','เงินสด (ค่าเริ่มต้น)')}</option>
     {accounts.map(account=><option key={account.value} value={account.value}>{account.label}</option>)}
    </select></label>
    <label>{l('Notes','หมายเหตุ')}<textarea name="notes" maxLength={1000}/></label>
   </details>
   {error&&<p className="finance-error" role="alert">{error}</p>}
   <div className="finance-submit">
    <button className="finance-button primary" disabled={pending}>{pending?l('Saving…','กำลังบันทึก…'):l('Confirm payment','ยืนยันการจ่าย')}</button>
    <button className="finance-button" type="button" disabled={pending} onClick={()=>{setOpen(false);setError('');}}>{l('Cancel','ยกเลิก')}</button>
   </div>
  </form>:<button className="finance-button primary" type="button" onClick={()=>setOpen(true)}>{l('Record payment','บันทึกการจ่าย')}</button>}
 </div>;
}
