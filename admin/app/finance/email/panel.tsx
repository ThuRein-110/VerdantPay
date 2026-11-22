'use client';

import {useState,useTransition,type ReactNode} from 'react';
import {useRouter} from 'next/navigation';
import {updateEmail} from './actions';
import {notificationLabels,type EmailAction,type EmailResult,type EmailState} from './types';

function EmailForm({action,thai,children,label,disabled=false}:{action:EmailAction;thai:boolean;children?:ReactNode;label:string;disabled?:boolean}) {
 const [pending,start]=useTransition();
 const [result,setResult]=useState<EmailResult|null>(null);
 const router=useRouter();
 const messages:Record<EmailResult,[string,string]>={
  saved:['Notification preferences saved.','บันทึกการตั้งค่าการแจ้งเตือนแล้ว'],
  queued:['Queued for delivery when the approved sender and schedule are active.','เข้าคิวแล้ว ระบบจะส่งเมื่อผู้ส่งที่อนุมัติและกำหนดการพร้อมใช้งาน'],
  verified:['Address verified. Choose notifications and enable delivery.','ยืนยันอีเมลแล้ว เลือกและเปิดใช้งานการแจ้งเตือน'],
  invalid:['Check the address, code or selected preferences.','ตรวจสอบอีเมล รหัส หรือการตั้งค่า'],
  unavailable:['The email service could not complete this request.','ระบบอีเมลไม่สามารถดำเนินการได้'],
  rate:['Wait before requesting another code or test email.','กรุณารอก่อนขอรหัสหรืออีเมลทดสอบอีกครั้ง'],
  unverified:['Verify the address before enabling delivery.','ยืนยันอีเมลก่อนเปิดการส่ง'],
  wrong_code:['The code is incorrect, expired or has reached its attempt limit.','รหัสไม่ถูกต้อง หมดอายุ หรือใช้เกินจำนวนครั้ง'],
  auth:['Sign in again with verified MFA.','กรุณาเข้าสู่ระบบใหม่ด้วย MFA'],
 };
 return <form className="finance-form" onSubmit={event=>{
  event.preventDefault();
  if(disabled||pending)return;
  const payload=new FormData(event.currentTarget);
  start(async()=>{
   try {
    const response=await updateEmail(action,payload);
    setResult(response);
    if(['saved','queued','verified'].includes(response))router.refresh();
   }catch{setResult('unavailable');}
  });
 }}>
  {children}
  <div className="finance-submit"><button className="finance-button" disabled={disabled||pending}>{pending?(thai?'กำลังบันทึก…':'Working…'):label}</button>
   {result&&<span role={['queued','saved','verified'].includes(result)?'status':'alert'}>{messages[result][thai?1:0]}</span>}</div>
 </form>;
}
export function EmailPanel({state,thai}:{state:EmailState;thai:boolean}) {
 const l=(en:string,th:string)=>thai?th:en;
 const format=new Intl.DateTimeFormat(thai?'th-TH':'en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Bangkok'});
 const statuses={sent:l('Sent','ส่งแล้ว'),failed:l('Failed','ล้มเหลว'),pending:l('Pending','รอส่ง')};
 const failures:Record<string,string>={
  recipient_changed:l('Recipient changed','อีเมลปลายทางเปลี่ยน'),recipient_not_approved:l('Recipient approval required','ต้องอนุมัติอีเมลปลายทาง'),
  disabled:l('Notification disabled','ปิดการแจ้งเตือน'),expired:l('Delivery expired','รายการหมดอายุ'),
  retry:l('Temporary delivery error','ข้อผิดพลาดชั่วคราว'),provider_rejected:l('Provider rejected the request','ผู้ให้บริการปฏิเสธคำขอ'),
  daily_quota:l('Daily limit reached','ถึงโควตารายวัน'),monthly_quota:l('Monthly limit reached','ถึงโควตารายเดือน'),
  verification_complete:l('Verification complete','ยืนยันสำเร็จแล้ว'),
 };
 return <section className="finance-panel finance-email" aria-labelledby="email-notifications">
  <h2 id="email-notifications">{l('Email Notifications','การแจ้งเตือนทางอีเมล')}</h2>
  <p className="finance-muted">{l('Verify your recipient and choose what to send. The deployment operator must approve the sender and recipient before delivery can start.','ยืนยันผู้รับและเลือกการแจ้งเตือน ผู้ดูแลระบบต้องอนุมัติผู้ส่งและผู้รับก่อนเริ่มส่ง')}</p>
  <EmailForm action="request" thai={thai} label={l('Send verification code','ส่งรหัสยืนยัน')}>
   <label>{l('Notification email','อีเมลแจ้งเตือน')}<input name="email" type="email" autoComplete="email" required maxLength={254} defaultValue={state.email??''}/></label>
   {state.verified_at&&<p className="finance-muted">{l('Verified','ยืนยันแล้ว')} · {format.format(new Date(state.verified_at))}</p>}
  </EmailForm>
  {state.email&&!state.verified_at&&<EmailForm action="verify" thai={thai} label={l('Verify address','ยืนยันอีเมล')}>
   <label>{l('Verification code','รหัสยืนยัน')}<input name="code" autoComplete="one-time-code" required minLength={24} maxLength={24} pattern="[0-9a-fA-F]{24}"/></label>
  </EmailForm>}
  <EmailForm key={String(state.enabled)+':'+state.kinds.join(',')+':'+String(state.verified_at)} action="save" thai={thai} label={l('Save preferences','บันทึกการตั้งค่า')}>
   <label className="finance-email-check"><input type="checkbox" name="enabled" defaultChecked={state.enabled} disabled={!state.verified_at}/>{l('Enable email delivery to my verified address','อนุญาตส่งอีเมลไปยังที่อยู่ที่ยืนยันแล้ว')}</label>
   <fieldset className="finance-email-options"><legend>{l('Notify me about','แจ้งเตือนเรื่อง')}</legend>
    {Object.entries(notificationLabels).map(([kind,title])=><label className="finance-email-check" key={kind}>
     <input type="checkbox" name="kind" value={kind} defaultChecked={state.kinds.includes(kind as typeof state.kinds[number])}/>{title[thai?1:0]}
    </label>)}
   </fieldset>
  </EmailForm>
  <EmailForm action="test" thai={thai} label={l('Send Test Email','ส่งอีเมลทดสอบ')} disabled={!state.verified_at}/>
  {state.paused_until&&Date.parse(state.paused_until)>Date.now()&&<p role="status" className="finance-muted">{l('Delivery paused until','หยุดส่งถึง')} {format.format(new Date(state.paused_until))}</p>}
  <h3>{l('Delivery history','ประวัติการส่ง')}</h3>
  {state.history.length?<ul className="finance-email-history">{state.history.map(row=><li key={row.id}>
   <div><strong>{row.kind==='verify'?l('Verification','ยืนยันอีเมล'):row.kind==='test'?l('Test email','อีเมลทดสอบ'):notificationLabels[row.kind][thai?1:0]}</strong>
    <small>{format.format(new Date(row.sent_at??row.queued_at))}{row.failure&&' · '+(failures[row.failure]??l('Delivery error','ข้อผิดพลาดในการส่ง'))}</small></div>
   <span className={'finance-state state-'+(row.state==='sent'?'paid':row.state==='failed'?'voided':'pending')}>{statuses[row.state]}</span>
  </li>)}</ul>:<p className="finance-muted">{l('No messages yet.','ยังไม่มีข้อความ')}</p>}
 </section>;
}
