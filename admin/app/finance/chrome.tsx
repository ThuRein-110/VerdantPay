'use client';

import Link from 'next/link';
import Image from 'next/image';
import {useRouter} from 'next/navigation';
import {createContext,Fragment,useContext,useEffect,useRef,useState,useSyncExternalStore,type ReactNode} from 'react';
import {ArrowDownLeft,ArrowUpRight,Boxes,Calculator,ChartNoAxesCombined,CheckCircle2,ChevronDown,ChevronRight,CircleUserRound,Coins,FileChartColumn,House,Landmark,LayoutList,LogOut,Moon,Plus,Settings,Sun,Target,UsersRound,Wallet,X} from 'lucide-react';
import {useLanguage} from '@mfu/ui/settings.tsx';
import {loadQuickEntry} from './actions';
import {sections,type Filters,type Section} from './model';
import {quickTypes,type QuickType} from './quick-types';
import {Entry} from './entry';
import memoLogo from '../../../mainlogo.png';

const nav = [
 ['overview','Home','หน้าหลัก',House], ['records','Records','รายการ',LayoutList],
 ['profit','Reports','รายงาน',ChartNoAxesCombined], ['goals','Goals','เป้าหมาย',Target], ['settings','Settings','ตั้งค่า',Settings],
] as const;
const secondary = [
 ['orders',LayoutList],['income',ArrowDownLeft],['expenses',ArrowUpRight],['investments',Landmark],
 ['cash',Wallet],['inventory',Boxes],['calculator',Calculator],['reports',FileChartColumn],['team',UsersRound],
] as const;
const icons={income:ArrowDownLeft,expense:ArrowUpRight,investment:Landmark,payout:Coins};
const QuickContext=createContext<((type?:QuickType)=>void)|null>(null);
const subscribe=()=>()=>{};
const hydrated=()=>true;
const server=()=>false;

export function ThemeButton({thai}:{thai:boolean}) {
 const {setTheme}=useLanguage();
 return <button type="button" className="finance-icon-button finance-theme" aria-label={thai?'สลับธีมสว่างและมืด':'Toggle light and dark theme'}
  onClick={()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark')}>
  <Sun className="finance-sun" size={20}/><Moon className="finance-moon" size={20}/>
 </button>;
}

export function FinancePreferences({thai}:{thai:boolean}) {
 const {theme,setTheme,locale,setLocale}=useLanguage();
 const router=useRouter();
 return <section className="finance-panel finance-preferences">
  <h2>{thai?'การแสดงผล':'Appearance'}</h2>
  <div className="finance-fields">
   <label>{thai?'ธีม':'Theme'}<select value={theme} onChange={event=>setTheme(event.target.value as typeof theme)}>
    <option value="system">{thai?'ตามระบบ':'System'}</option><option value="light">{thai?'สว่าง':'Light'}</option><option value="dark">{thai?'มืด':'Dark'}</option>
   </select></label>
   <label>{thai?'ภาษา':'Language'}<select value={locale==='th'?'th':'en'} onChange={event=>{setLocale(event.target.value as 'en'|'th');router.refresh();}}>
    <option value="en">English</option><option value="th">ไทย</option>
   </select></label>
  </div>
 </section>;
}

export function QuickButton({type,children,className='finance-button'}:{type?:QuickType;children:ReactNode;className?:string}) {
 const open=useContext(QuickContext);
 return <button type="button" className={className} disabled={!open} onClick={()=>open?.(type)}>{children}</button>;
}

function AddSheet({dialogRef,thai,mode,change,status,onClose,onSaved}:{dialogRef:React.RefObject<HTMLDialogElement|null>;thai:boolean;mode:QuickType;
 change:(value:QuickType)=>void;status:Awaited<ReturnType<typeof loadQuickEntry>>|null;onClose:()=>void;onSaved:()=>void}) {
 const l=(en:string,th:string)=>thai?th:en;
 return <dialog className="finance-sheet" ref={dialogRef} aria-labelledby="finance-sheet-title" onClose={onClose}
  onClick={event=>{if(event.target===event.currentTarget)event.currentTarget.close();}}>
  <div className="finance-sheet-inner">
   <div className="finance-sheet-handle" aria-hidden="true"/>
   <header><div><h2 id="finance-sheet-title">{l('Add record','เพิ่มรายการ')}</h2><p>{l('Choose what to record.','เลือกประเภทที่จะบันทึก')}</p></div>
    <button type="button" className="finance-icon-button" aria-label={l('Close add record','ปิดแบบฟอร์ม')} onClick={()=>dialogRef.current?.close()}><X size={20}/></button></header>
   <div className="finance-sheet-types" role="group" aria-label={l('Record type','ประเภทรายการ')}>
    {(Object.keys(quickTypes) as QuickType[]).map(key=>{const Icon=icons[key];return <button key={key} type="button" className="finance-button" aria-pressed={mode===key} onClick={()=>change(key)}><Icon size={17}/>{quickTypes[key][thai?1:0]}</button>;})}
   </div>
   {!status?<div className="finance-form-skeleton" role="status"><span className="sr-only">{l('Loading form','กำลังโหลดแบบฟอร์ม')}</span><i/><i/><i/></div>:null}
   {status?.error&&<p role="alert" className="finance-error">{status.error} <button type="button" className="finance-button" onClick={()=>change(mode)}>{l('Retry','ลองใหม่')}</button></p>}
   {status?.message&&<p className="finance-empty">{status.message}</p>}
   {status?.form&&<>
    {mode==='income'&&status.form.fields.find(field=>field.key==='target')?.list?.length===0
     ?<div className="finance-empty"><p>{l('Create an order before recording a receipt.','สร้างคำสั่งซื้อก่อนบันทึกรับเงิน')}</p><Link href="/finance?section=orders#entry" onClick={()=>dialogRef.current?.close()}>{l('Go to orders','ไปที่คำสั่งซื้อ')} <ChevronRight size={16}/></Link></div>
     :<Entry key={mode} form={status.form} thai={thai} summary={false} quick onSaved={onSaved}/>}
   </>}
  </div>
 </dialog>;
}

export function FinanceChrome({children,section,dates,thai,title,period}:{children:ReactNode;section:Section;dates:Filters;thai:boolean;title:string;period:string}) {
 const dialog=useRef<HTMLDialogElement>(null);
 const ready=useSyncExternalStore(subscribe,hydrated,server);
 const version=useRef(0);
 const [mode,setMode]=useState<QuickType>('income');
 const [status,setStatus]=useState<Awaited<ReturnType<typeof loadQuickEntry>>|null>(null);
 const [toast,setToast]=useState(0);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
 const l=(en:string,th:string)=>thai?th:en;
 const href=(key:Section)=>'/finance?'+new URLSearchParams({section:key,range:dates.range,from:dates.from,to:dates.to});
 const active=nav.some(([key])=>key===section)?section:section==='reports'?'profit':section==='team'?'settings':'records';
 const change=async (type:QuickType)=>{
  setMode(type);
  setStatus(null);
  const current=++version.current;
  try {
   const result=await loadQuickEntry(type,thai);
   if(current===version.current)setStatus(result);
  } catch {
   if(current===version.current)setStatus({error:l('Could not load the record form. Try again.','โหลดแบบฟอร์มไม่ได้ กรุณาลองใหม่')});
  }
 };
 const open=(type:QuickType='income')=>{
  if(!dialog.current?.open)dialog.current?.showModal();
  void change(type);
 };
 const saved=()=>{
  dialog.current?.close();
  setToast(value=>value+1);
  if(timer.current) clearTimeout(timer.current);
  timer.current=setTimeout(()=>setToast(0),3800);
 };
 return <QuickContext.Provider value={ready?open:null}>
  <div className="finance">
   <aside className="finance-sidebar">
    <Link className="finance-sidebar-title" href={href('overview')}><BrandMark/><span><strong>Memo Finance</strong><small>3D Printing MFU</small></span></Link>
    <QuickButton className="finance-sidebar-add"><Plus size={19}/>{l('Add record','เพิ่มรายการ')}</QuickButton>
    <nav aria-label={l('Finance navigation','เมนูการเงิน')}>
     {nav.map(([key,en,th,Icon])=><Link key={key} href={href(key)} aria-current={key===active?'page':undefined}><Icon size={19}/>{l(en,th)}</Link>)}
    </nav>
    <nav className="finance-secondary-nav" aria-label={l('Finance modules','เมนูย่อยการเงิน')}>
     {secondary.map(([key,Icon])=><Link key={key} href={href(key)} aria-current={key===section?'page':undefined}><Icon size={17}/>{sections[key][thai?1:0]}</Link>)}
    </nav>
    <Link className="finance-back" href="/dashboard"><LogOut size={17}/>{l('Admin workspace','พื้นที่ผู้ดูแล')}</Link>
   </aside>
   <div className="finance-workspace">
    <header className="finance-topbar">
     <div className="finance-identity"><Link href={href('overview')} className="finance-mobile-mark" aria-label={l('Memo Finance home','หน้าหลักการเงิน Memo')}><BrandMark/></Link><div>
      <h1 className="finance-mobile-title">{section==='overview'?l('Hello, Memo','สวัสดี Memo'):title}</h1>
      <strong className="finance-desktop-title">Memo Finance</strong>
      {['goals','settings'].includes(section)?null:<a href="#finance-period" className="finance-top-period">{period}<ChevronDown size={12}/></a>}
     </div></div>
     <div className="finance-top-actions"><ThemeButton thai={thai}/><Link className="finance-icon-button" href={href('settings')} aria-label={l('Profile and settings','โปรไฟล์และการตั้งค่า')}><CircleUserRound size={21}/></Link></div>
    </header>
    <div className="finance-body">{children}</div>
   </div>
   <nav className="finance-bottom" aria-label={l('Mobile finance navigation','เมนูการเงินบนมือถือ')}>
    {nav.filter(([key])=>key!=='records').map(([key,en,th,Icon])=><Fragment key={key}>
     {key==='goals'&&<QuickButton className="finance-fab"><Plus size={26}/><span className="sr-only">{l('Add record','เพิ่มรายการ')}</span></QuickButton>}
     <Link href={href(key)} aria-current={key===active?'page':undefined}><Icon size={21}/><span>{l(en,th)}</span></Link>
    </Fragment>)}
   </nav>
   <AddSheet dialogRef={dialog} thai={thai} mode={mode} status={status} change={type=>void change(type)} onClose={()=>{version.current++;setStatus(null);}} onSaved={saved}/>
   {toast>0&&<div className="finance-toast" role="status" key={toast}><CheckCircle2 size={19}/>{l('Record saved','บันทึกรายการแล้ว')}</div>}
  </div>
 </QuickContext.Provider>;
}

export function BrandMark() {
 return <span className="finance-mark"><Image src={memoLogo} alt="" width={104} height={104}/></span>;
}
