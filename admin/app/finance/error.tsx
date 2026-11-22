'use client';

import {useLanguage} from '@mfu/ui/settings.tsx';
import './finance.css';
export default function FinanceError({reset}:{error:Error;reset:()=>void}) {
 const {locale}=useLanguage();
 const thai=locale==='th';
 return <section className="finance-loading"><div className="finance-panel">
  <h1>{thai?'โหลดข้อมูลการเงินไม่ได้':'Finance is unavailable'}</h1>
  <p>{thai?'โปรดลองใหม่อีกครั้ง':'Please try again.'}</p>
  <button type="button" className="finance-button" onClick={reset}>{thai?'ลองใหม่':'Try again'}</button>
 </div></section>;
}
