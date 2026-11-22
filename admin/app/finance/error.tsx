'use client';

import {useLanguage} from '@mfu/ui/settings.tsx';
import Link from 'next/link';
import './finance.css';
export default function FinanceError({reset}:{error:Error;reset:()=>void}) {
 const {locale}=useLanguage();
 const thai=locale==='th';
 return <section className="finance-loading"><div className="finance-panel">
  <h1>{thai?'โหลดข้อมูลการเงินไม่ได้':'Finance is unavailable'}</h1>
  <p>{thai?'ลองใหม่หรือตรวจสอบการตั้งค่าจากหน้าผู้ดูแล':'Try again or check the connection from the admin workspace.'}</p>
  <button type="button" className="finance-button" onClick={reset}>{thai?'ลองใหม่':'Try again'}</button>
  <Link className="finance-button" href="/dashboard">{thai?'หน้าผู้ดูแล':'Admin workspace'}</Link>
 </div></section>;
}
