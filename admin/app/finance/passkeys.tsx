'use client';

import {useState,useSyncExternalStore,useTransition} from 'react';
import {Fingerprint} from 'lucide-react';
import {beginPasskey,changeFinancePasskey,finishPasskey,listFinancePasskeys} from './auth/passkey-actions';

type Labels=(english:string,thai:string)=>string;
type Item={id:string;friendly_name?:string;created_at:string;last_used_at?:string};
const subscribe=()=>()=>{};
const supported=()=>window.isSecureContext&&typeof PublicKeyCredential!=='undefined'&&
 typeof PublicKeyCredential.parseRequestOptionsFromJSON==='function'&&
 typeof PublicKeyCredential.parseCreationOptionsFromJSON==='function'&&typeof PublicKeyCredential.prototype.toJSON==='function';

function message(code:string,l:Labels) {
 switch(code){
  case 'cancelled':return l('The passkey prompt was cancelled or timed out. You can try again.','ยกเลิกหรือหมดเวลาการใช้พาสคีย์ ลองใหม่ได้');
  case 'reauthenticate':return l('Sign out and sign in again with your password and authenticator code to manage passkeys.','ออกจากระบบและเข้าสู่ระบบใหม่ด้วยรหัสผ่านและรหัสยืนยันเพื่อจัดการพาสคีย์');
  case 'disabled':return l('Passkeys are currently unavailable. Password sign-in remains available.','ยังใช้พาสคีย์ไม่ได้ในขณะนี้ คุณยังเข้าสู่ระบบด้วยรหัสผ่านได้');
  case 'domain':return l('Passkeys are unavailable on this website address.','ไม่สามารถใช้พาสคีย์บนที่อยู่เว็บไซต์นี้');
  case 'expired':return l('The passkey request expired. Try again.','คำขอพาสคีย์หมดเวลา กรุณาลองใหม่');
  case 'rate':return l('Too many attempts. Wait a few minutes and try again.','ลองหลายครั้งเกินไป โปรดรอสักครู่แล้วลองใหม่');
  case 'signed-in':return l('Sign out before using a passkey for another account.','ออกจากระบบก่อนใช้พาสคีย์ของบัญชีอื่น');
  case 'name':return l('Enter a name between 1 and 120 characters.','ระบุชื่อระหว่าง 1 ถึง 120 ตัวอักษร');
  default:return l('The passkey request could not be completed. Try again or use password sign-in.','ใช้พาสคีย์ไม่สำเร็จ โปรดลองใหม่หรือเข้าสู่ระบบด้วยรหัสผ่าน');
 }
}

async function ceremony(mode:'sign-in'|'register') {
 try {
  const begin=await beginPasskey(mode);
  if(!('options' in begin)||!begin.options)return begin.error??'unavailable';
  const credential=mode==='register'
   ?await navigator.credentials.create({publicKey:PublicKeyCredential.parseCreationOptionsFromJSON(begin.options as PublicKeyCredentialCreationOptionsJSON)})
   :await navigator.credentials.get({publicKey:PublicKeyCredential.parseRequestOptionsFromJSON(begin.options as PublicKeyCredentialRequestOptionsJSON)});
  if(!(credential instanceof PublicKeyCredential))return 'cancelled';
  const result=await finishPasskey(mode,credential.toJSON());
  return result.error??'';
 }catch(error){
  return error instanceof DOMException&&['NotAllowedError','AbortError'].includes(error.name)?'cancelled':'unavailable';
 }
}

export function PasskeySignIn({thai,disabled}:{thai:boolean;disabled:boolean}) {
 const [busy,start]=useTransition();
 const [error,setError]=useState('');
 const ready=useSyncExternalStore(subscribe,()=>true,()=>false);
 const available=useSyncExternalStore(subscribe,supported,()=>false);
 const l:Labels=(en,th)=>thai?th:en;
 if(ready&&!available)return <p className="finance-muted">{l('This browser does not support passkeys. You can sign in with your password.','เบราว์เซอร์นี้ไม่รองรับพาสคีย์ คุณยังเข้าสู่ระบบด้วยรหัสผ่านได้')}</p>;
 return <>
  <button className="finance-button" type="button" disabled={!ready||busy||disabled} onClick={()=>start(async()=>{
   setError('');
   const result=await ceremony('sign-in');
   if(result)setError(result);
   else location.assign('/finance');
  })}><Fingerprint size={18} aria-hidden/>{busy?l('Waiting for passkey…','กำลังรอพาสคีย์…'):l('Sign in with passkey','เข้าสู่ระบบด้วยพาสคีย์')}</button>
  {error&&<p className="finance-error" role="alert">{message(error,l)}</p>}
 </>;
}

export function FinanceSecurity({thai}:{thai:boolean}) {
 const [items,setItems]=useState<Item[]|null>(null);
 const [recent,setRecent]=useState(false);
 const [error,setError]=useState('');
 const [status,setStatus]=useState('');
 const [busy,start]=useTransition();
 const available=useSyncExternalStore(subscribe,supported,()=>false);
 const l:Labels=(en,th)=>thai?th:en;
 const date=(value:string)=>new Intl.DateTimeFormat(thai?'th':'en',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Bangkok'}).format(new Date(value));
 async function reload(){
  try{
   const info=await listFinancePasskeys();
   if('items' in info&&info.items){setItems(info.items);setRecent(info.recent);}
   else setError(info.error??'unavailable');
  }catch{setError('unavailable');}
 }
 function change(operation:()=>Promise<string>,done:string){
  start(async()=>{
   setStatus('');setError('');
   try {
    const failure=await operation();
    if(failure)setError(failure);
    else{setStatus(done);await reload();}
   }catch{setError('unavailable');}
  });
 }
 return <section className="finance-panel" aria-labelledby="finance-security-title">
  <h2 id="finance-security-title">{l('Security','ความปลอดภัย')}</h2>
  <p className="finance-muted">{l('Use a passkey from your device, password manager, or security key. Keep your password for recovery.','ใช้พาสคีย์จากอุปกรณ์ ตัวจัดการรหัสผ่าน หรือกุญแจความปลอดภัย และเก็บรหัสผ่านไว้สำหรับการกู้คืน')}</p>
  <div className="finance-submit">
   {items===null?<button type="button" className="finance-button" disabled={busy} onClick={()=>start(async()=>{setError('');await reload();})}>{l('Manage passkeys','จัดการพาสคีย์')}</button>:
    <button type="button" className="finance-button primary" disabled={busy||!available||!recent}
     onClick={()=>change(()=>ceremony('register'),l('Passkey registered.','ลงทะเบียนพาสคีย์แล้ว'))}><Fingerprint size={18} aria-hidden/>{l('Register a passkey','ลงทะเบียนพาสคีย์')}</button>}
  </div>
  {items!==null&&!available&&<p className="finance-muted">{l('Register a passkey from a supported browser or device.','ลงทะเบียนพาสคีย์จากเบราว์เซอร์หรืออุปกรณ์ที่รองรับ')}</p>}
  {items!==null&&!recent&&<p className="finance-muted">{message('reauthenticate',l)}</p>}
  {error&&<p className="finance-error" role="alert">{message(error,l)}</p>}
  {status&&<p role="status">{status}</p>}
  {items!==null&&items.length===0&&<p className="finance-muted">{l('No passkeys registered.','ยังไม่มีพาสคีย์ที่ลงทะเบียน')}</p>}
  {items?.map(item=><form className="finance-form finance-access-item" key={item.id+':'+item.friendly_name} onSubmit={event=>{
   event.preventDefault();
   const label=String(new FormData(event.currentTarget).get('name')??'');
   change(async()=>(await changeFinancePasskey('rename',item.id,label)).error??'',l('Passkey renamed.','เปลี่ยนชื่อพาสคีย์แล้ว'));
  }}>
   <label>{l('Passkey name','ชื่อพาสคีย์')}<input name="name" required maxLength={120} defaultValue={item.friendly_name||l('Passkey','พาสคีย์')}/></label>
   <p className="finance-muted">{l('Registered','ลงทะเบียน')} {date(item.created_at)}
    {item.last_used_at?' · '+l('Last used','ใช้ล่าสุด')+' '+date(item.last_used_at):''}</p>
   <div className="finance-submit">
    <button className="finance-button" disabled={busy||!recent}>{l('Rename','เปลี่ยนชื่อ')}</button>
    <button className="finance-button" type="button" disabled={busy||!recent} onClick={()=>{
     if(confirm(l('Remove this passkey?','ลบพาสคีย์นี้หรือไม่')))change(async()=>(await changeFinancePasskey('remove',item.id)).error??'',l('Passkey removed.','ลบพาสคีย์แล้ว'));
    }}>{l('Remove','ลบ')}</button>
   </div>
  </form>)}
 </section>;
}
