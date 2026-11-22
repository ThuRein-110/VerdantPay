import {Target} from 'lucide-react';
import Link from 'next/link';
import {GoalForm} from './goal-form';
import {thb,type L} from './model';
import type {Row} from './data';

function GoalCard({goal,thai,editable=false}:{goal:Row;thai:boolean;editable?:boolean}) {
 const l:L=(en,th)=>thai?th:en;
 const locale=thai?'th':'en';
 const saved=Number(goal.saved_satang),target=Number(goal.target_satang);
 const fraction=Math.min(1,saved/target);
 const percent=new Intl.NumberFormat(locale,{style:'percent',maximumFractionDigits:1}).format(fraction);
 const title=String(goal.title);
 return <article className="finance-panel finance-goal-card">
  <header><span className="finance-goal-icon"><Target size={19}/></span><div><h3>{title}</h3>
   {goal.deadline&&<time dateTime={String(goal.deadline)}>{String(goal.deadline)}</time>}</div><strong className="finance-goal-percent">{percent}</strong></header>
  <div className="finance-goal-amounts"><span>{l('Saved','สะสม')} <strong>{thb(saved,locale)}</strong></span>
   <span>{l('Target','เป้าหมาย')} <strong>{thb(target,locale)}</strong></span></div>
  <progress max={1} value={fraction} aria-label={title}/>
  {editable&&<GoalForm key={String(goal.id)+':'+goal.version} thai={thai} goal={goal}/>}
 </article>;
}

export function GoalPreview({goal,thai,href}:{goal?:Row;thai:boolean;href:string}) {
 const l:L=(en,th)=>thai?th:en;
 return <section className="finance-goal-section">
  <header className="finance-section-head"><h2>{l('Active goals','เป้าหมายที่กำลังดำเนินการ')}</h2><Link href={href}>{goal?l('View all','ดูทั้งหมด'):l('Add goal','เพิ่มเป้าหมาย')}</Link></header>
  {goal?<GoalCard goal={goal} thai={thai}/>:<p className="finance-panel finance-muted">{l('Track progress toward your next business purchase.','ติดตามความคืบหน้าของเป้าหมายธุรกิจถัดไป')}</p>}
 </section>;
}

export function Goals({goals,thai}:{goals:Row[];thai:boolean}) {
 const l:L=(en,th)=>thai?th:en;
 return <section className="finance-goal-section">
  <div className="finance-panel"><p>{l('Track money set aside for your business goals. Goal updates are separate from your cash records.','ติดตามเงินที่จัดสรรไว้สำหรับเป้าหมายธุรกิจ ยอดเป้าหมายแยกจากรายการเงินสด')}</p><GoalForm thai={thai}/></div>
  <div className="finance-goal-grid">{goals.map(goal=><GoalCard key={String(goal.id)} goal={goal} thai={thai} editable/>)}</div>
 </section>;
}
