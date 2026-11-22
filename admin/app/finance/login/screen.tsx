'use client';

import {useRef,useState,useTransition,type ReactNode} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Eye,EyeOff} from 'lucide-react';
import {BrandMark,ThemeButton} from '../chrome';
import {authInput} from '../auth/input';

export type AuthScreen='login'|'signup'|'forgot-password'|'reset-password'|'verify'|'pending';
type Result={error?:string;destination?:string;message?:string;factor?:string;secret?:string};

function PasswordField({name,label,thai,existing=false}:{name:string;label:string;thai:boolean;existing?:boolean}) {
 const [visible,setVisible]=useState(false);
 return <div className="finance-auth-password">
  <label>{label}<input type={visible?'text':'password'} name={name} required
   maxLength={existing?128:72} autoComplete={existing?'current-password':'new-password'}/></label>
  <button type="button" className="finance-icon-button" aria-label={(thai?(visible?'ซ่อน':'แสดง'):(visible?'Hide ':'Show '))+label.toLowerCase()} aria-pressed={visible} onClick={()=>setVisible(value=>!value)}>
   {visible?<EyeOff size={17}/>:<Eye size={17}/>}
  </button>
 </div>;
}
export function FinanceAuthFrame({thai,children}:{thai:boolean;children:ReactNode}) {
 return <div className="finance finance-login">
  <div className="finance-login-toolbar"><ThemeButton thai={thai}/></div>
  <div className="finance-login-inner">
   <div className="finance-login-brand"><BrandMark/><strong>Memo Finance</strong>
    <p>{thai?'พื้นที่การเงินของธุรกิจ':'Your private business workspace'}</p></div>
   <section className="inline-auth">{children}</section>
  </div>
 </div>;
}
export function FinanceSignOut({thai}:{thai:boolean}) {
 const router=useRouter();
 const [pending,start]=useTransition();
 const [failed,setFailed]=useState(false);
 return <div className="finance-submit">
  <button type="button" className="finance-button" disabled={pending} onClick={()=>start(async()=>{
   try {
    const response=await fetch('/finance/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})});
    if(!response.ok)throw Error('Sign-out failed');
    router.replace('/finance/login');
    router.refresh();
   }catch{setFailed(true);}
  })}>{thai?'ออกจากระบบ':'Sign out'}</button>
  {failed&&<p role="alert">{thai?'ออกจากระบบไม่ได้ กรุณาลองอีกครั้ง':'Could not sign out. Please try again.'}</p>}
 </div>;
}

export function FinanceLogin({thai,screen='login',initialMfa=false,result,requested=true}:{thai:boolean;screen?:AuthScreen;initialMfa?:boolean;result?:string;requested?:boolean}) {
 const router=useRouter();
 const [mfa,setMfa]=useState(initialMfa);
 const [factor,setFactor]=useState('');
 const [secret,setSecret]=useState('');
 const [message,setMessage]=useState('');
 const [error,setError]=useState('');
 const [busy,start]=useTransition();
 const inFlight=useRef(false);
 const l=(en:string,th:string)=>thai?th:en;
 const titles:Record<AuthScreen,string>={
  login:mfa?l('Verify your sign-in','ยืนยันการเข้าสู่ระบบ'):l('Welcome back','ยินดีต้อนรับกลับ'),
  signup:l('Create account','สร้างบัญชี'), 'forgot-password':l('Forgot password','ลืมรหัสผ่าน'),
  'reset-password':l('Reset password','ตั้งรหัสผ่านใหม่'),verify:l('Email verification','ยืนยันอีเมล'),
  pending:l('Pending approval','รออนุมัติ'),
 };
 const errors:Record<string,string>={
  email:l('Enter a valid email address.','กรอกอีเมลที่ถูกต้อง'),
  password:l('Use at least 12 characters with a letter and a number or symbol (maximum 72 bytes).','ใช้ 12 ตัวอักษรขึ้นไป มีตัวอักษรและตัวเลขหรือสัญลักษณ์ (สูงสุด 72 ไบต์)'),
  confirmation:l('The passwords must match.','รหัสผ่านทั้งสองช่องต้องตรงกัน'),
  name:l('Enter your full name.','กรอกชื่อและนามสกุล'),
  login:l('We could not sign you in. Check your details and confirm your email if required.','เข้าสู่ระบบไม่ได้ ตรวจสอบข้อมูลและยืนยันอีเมลหากจำเป็น'),
  rate:l('Too many attempts. Please wait and try again.','ลองหลายครั้งเกินไป กรุณารอสักครู่'),
  mfa:l('That code could not be verified. Try a fresh code.','ยืนยันรหัสไม่ได้ กรุณาลองรหัสใหม่'),
  recovery:l('This reset session expired. Request a new link.','เซสชันตั้งรหัสผ่านหมดอายุ กรุณาขอลิงก์ใหม่'),
  same_password:l('Choose a password you have not just used.','เลือกรหัสผ่านที่ต่างจากรหัสเดิม'),
 };
 const submit=(action:string,values:Record<string,FormDataEntryValue>={})=>{
  if(inFlight.current)return;
  const payload={...values,action,...(action==='verify-mfa'?{factor}:{})};
  const checked=authInput.safeParse(payload);
  if(!checked.success){setError(String(checked.error.issues[0]?.path[0]||'invalid'));return;}
  inFlight.current=true;
  setMessage('');
  setError('');
  start(async()=>{
   try {
    const response=await fetch('/finance/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(checked.data)});
    const data=await response.json() as Result;
    if(data.error||!response.ok){setError(data.error??'unavailable');return;}
    if(data.factor){setFactor(data.factor);setSecret(data.secret??'');setMfa(true);return;}
    if(data.message){setMessage(data.message);return;}
    if(data.destination==='/finance/login'&&action==='login'){setMfa(true);return;}
    if(data.destination&&/^\/finance(?:\/(?:login|pending|verify|team-access))?(?:\?reset=1)?$/.test(data.destination)){
     router.replace(data.destination);
     router.refresh();
    }
   }catch{setError('unavailable');}
   finally{inFlight.current=false;}
  });
 };
 const submitForm=(action:string,label:string,fields:ReactNode)=><form onSubmit={event=>{
  event.preventDefault();
  submit(action,Object.fromEntries(new FormData(event.currentTarget)));
 }}>{fields}<button className="button full" disabled={busy}>{busy?l('Working…','กำลังดำเนินการ…'):label}</button></form>;
 const emailField=<label>{l('Email address','อีเมล')}<input type="email" name="email" autoComplete="email" maxLength={254} required/></label>;
 const passwordFields=<><PasswordField name="password" thai={thai} label={l('Password','รหัสผ่าน')}/>
  <PasswordField name="confirmation" thai={thai} label={l('Confirm password','ยืนยันรหัสผ่าน')}/></>;
 return <FinanceAuthFrame thai={thai}>
  <h1>{titles[screen]}</h1>
  {error&&<p className="finance-error finance-auth-message" role="alert">{errors[error]??l('This request could not be completed. Please try again.','ดำเนินการไม่สำเร็จ กรุณาลองใหม่')}</p>}
  {message==='email_sent'&&<p className="finance-auth-message" role="status">{l('If an eligible account exists, check its inbox for a link. Open it in this browser.','หากมีบัญชีที่ใช้ได้ โปรดตรวจสอบกล่องจดหมายและเปิดลิงก์ในเบราว์เซอร์นี้')}</p>}
  {screen==='login'&&!mfa&&<>
   {result==='reset'&&<p role="status">{l('Password updated. Sign in again.','ตั้งรหัสผ่านแล้ว กรุณาเข้าสู่ระบบใหม่')}</p>}
   {submitForm('login',l('Sign in','เข้าสู่ระบบ'),<>{emailField}<PasswordField name="password" thai={thai} label={l('Password','รหัสผ่าน')} existing/></>)}
   <nav className="finance-auth-links"><Link href="/finance/signup">{l('Create account','สร้างบัญชี')}</Link><Link href="/finance/forgot-password">{l('Forgot password?','ลืมรหัสผ่าน?')}</Link></nav>
  </>}
  {screen==='login'&&mfa&&<>
   <p className="finance-auth-message">{l('Approved accounts use an authenticator code before opening private records.','บัญชีที่อนุมัติต้องกรอกรหัสจากแอปยืนยันก่อนเปิดข้อมูลส่วนตัว')}</p>
   {secret&&<p className="secret">{l('Add this setup key to your authenticator app: ','เพิ่มคีย์นี้ในแอปยืนยัน: ')}{secret}</p>}
   {factor?submitForm('verify-mfa',l('Verify code','ยืนยันรหัส'),<label>{l('Authenticator code','รหัสยืนยัน')}<input name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}"/></label>):
    <button type="button" className="finance-button primary" disabled={busy} onClick={()=>submit('mfa')}>{l('Continue with authenticator','ดำเนินการด้วยแอปยืนยัน')}</button>}
   <FinanceSignOut thai={thai}/>
  </>}
  {screen==='signup'&&submitForm('signup',l('Create account','สร้างบัญชี'),<><label>{l('Full name','ชื่อและนามสกุล')}<input name="name" required maxLength={120} autoComplete="name"/></label>{emailField}{passwordFields}</>)}
  {screen==='forgot-password'&&submitForm('forgot',l('Send reset link','ส่งลิงก์ตั้งรหัสผ่าน'),emailField)}
  {screen==='reset-password'&&submitForm('reset',l('Save new password','บันทึกรหัสผ่านใหม่'),passwordFields)}
  {screen==='verify'&&<p className="finance-auth-message" role="status">{result==='confirmed'?
   l('Email confirmed. Continue to pending approval if you are awaiting access.','ยืนยันอีเมลแล้ว ดำเนินการต่อหากกำลังรออนุมัติ'):
   result==='expired'?l('The link was invalid or expired, or it was opened in a different browser. Request a new link.','ลิงก์หมดอายุ ไม่ถูกต้อง หรือเปิดในเบราว์เซอร์อื่น กรุณาขอลิงก์ใหม่'):
   l('If email confirmation is required, check your inbox and open the link in this browser. Otherwise, continue to sign in.','หากต้องยืนยันอีเมล โปรดเปิดลิงก์จากกล่องจดหมายในเบราว์เซอร์นี้ หรือเข้าสู่ระบบเพื่อดำเนินการต่อ')}</p>}
  {screen==='verify'&&<nav className="finance-auth-links">
   {result==='expired'?<Link href="/finance/signup">{l('Return to account registration','กลับไปหน้าสมัครบัญชี')}</Link>:
    <Link href="/finance/pending">{l('Check approval','ตรวจสอบการอนุมัติ')}</Link>}
   <Link href="/finance/forgot-password">{l('Password recovery','กู้คืนรหัสผ่าน')}</Link>
  </nav>}
  {screen==='pending'&&<>
   <p className="finance-auth-message">{l('The business owner must approve your account before you can view finance records.','เจ้าของธุรกิจต้องอนุมัติบัญชีก่อนที่คุณจะดูข้อมูลการเงินได้')}</p>
   {requested?<button className="finance-button" type="button" onClick={()=>router.refresh()}>{l('Check approval status','ตรวจสถานะ')}</button>:
    <button className="finance-button" type="button" disabled={busy} onClick={()=>submit('request')}>{l('Request access','ขอสิทธิ์เข้าถึง')}</button>}
   <FinanceSignOut thai={thai}/>
  </>}
  {screen!=='login'&&screen!=='pending'&&<Link className="finance-edit-link" href="/finance/login">{l('Back to sign in','กลับไปเข้าสู่ระบบ')}</Link>}
 </FinanceAuthFrame>;
}
