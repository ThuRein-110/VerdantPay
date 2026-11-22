import Link from 'next/link';
import {ArrowDownLeft,ArrowLeftRight,ArrowRight,ArrowUpRight,Boxes,ChevronDown,ChevronRight,CircleDollarSign,Coins,Landmark,ReceiptText,UsersRound,Wallet} from 'lucide-react';
import {QuickButton} from './chrome';
import {code} from './forms';
import {thb,type Filters,type L} from './model';
import type {Row,Stats} from './data';
import type {TeamSummary} from './analytics';

export function financeUrl(section:string,dates:Filters,extra:Record<string,string>={}) {
 return '/finance?'+new URLSearchParams({section,range:dates.range,from:dates.from,to:dates.to,...extra});
}
export function Balance({data,l,thai}:{data:Stats;l:L;thai:boolean}) {
 const locale=thai?'th':'en';
 return <section className="finance-balance" aria-label={l('Cash balance','เงินสดคงเหลือ')}>
  <div className="finance-balance-top"><span>{l('Current cash balance','เงินสดคงเหลือปัจจุบัน')}</span><span className="finance-balance-wallet"><Wallet size={21}/></span></div>
  <strong>{thb(data.cash,locale)}</strong>
  <div className="finance-balance-detail">
   <div><span><ArrowDownLeft size={15}/>{l('Income','รายรับ')}</span><b>{thb(data.revenue,locale)}</b></div>
   <div><span><ArrowUpRight size={15}/>{l('Total expenses','ค่าใช้จ่ายรวม')}</span><b>{thb(data.directCost+data.operating+data.depreciation,locale)}</b></div>
  </div>
 </section>;
}
export function DashboardActions({dates,l}:{dates:Filters;l:L}) {
 return <div className="finance-quick" aria-label={l('Quick actions','ทางลัด')}>
  <QuickButton type="income" className="finance-quick-tile"><span><ArrowDownLeft size={23}/></span>{l('Add income','เพิ่มรายรับ')}</QuickButton>
  <QuickButton type="expense" className="finance-quick-tile"><span><ArrowUpRight size={23}/></span>{l('Add expense','เพิ่มค่าใช้จ่าย')}</QuickButton>
  <Link className="finance-quick-tile" href={financeUrl('records',dates)}><span><ReceiptText size={23}/></span>{l('Records','รายการ')}</Link>
  <Link className="finance-quick-tile" href={financeUrl('team',dates)}><span><UsersRound size={23}/></span>{l('Team shares','ส่วนแบ่งทีม')}</Link>
 </div>;
}
const categoryIcons:Record<string,typeof Wallet>={receipt:ArrowDownLeft,refund:ArrowUpRight,expense:ReceiptText,filament_purchase:Boxes,equipment:Landmark,
 transfer_out:ArrowLeftRight,transfer_in:ArrowLeftRight,owner_contribution:Landmark,team_contribution:Landmark,team_payout:Coins,loan:Landmark};
const modules:Record<string,string>={receipt:'income',refund:'income',expense:'expenses',filament_purchase:'inventory',equipment:'investments',
 owner_contribution:'investments',team_contribution:'investments',capital_repayment:'investments',owner_withdrawal:'investments',
 loan:'investments',loan_repayment:'investments',team_payout:'team',transfer_out:'cash',transfer_in:'cash'};
export function RecentTransactions({records,l,thai,dates,full=false,query='',kind='',sort='new',page=1,count=0}:{records:Row[];l:L;thai:boolean;dates:Filters;
 full?:boolean;query?:string;kind?:string;sort?:string;page?:number;count?:number}) {
 const locale=thai?'th':'en';
 return <section className="finance-panel finance-transactions">
  <header><div><h2>{full?l('Transactions','รายการเงินสด'):l('Recent transactions','รายการล่าสุด')}</h2>
   <p>{full?l('Cash movements across your accounts','การเคลื่อนไหวเงินในทุกบัญชี'):l('Latest activity across your accounts','ความเคลื่อนไหวล่าสุดในทุกบัญชี')}</p></div>
   {!full&&<Link href={financeUrl('records',dates)}>{l('View all','ดูทั้งหมด')} <ChevronRight size={16}/></Link>}</header>
  {full&&<form method="get" action="/finance" className="finance-record-filter">
   {Object.entries({section:'records',...dates}).map(([key,value])=><input type="hidden" key={key} name={key} value={value}/>)}
   <input name="q" maxLength={120} defaultValue={query} placeholder={l('Search description','ค้นหารายละเอียด')} aria-label={l('Search description','ค้นหารายละเอียด')}/>
   <button className="finance-button">{l('Filter','กรอง')}</button>
   <nav className="finance-filter-chips" aria-label={l('Quick transaction filters','ตัวกรองรายการด่วน')}>
    {([['','All','ทั้งหมด'],['receipt','Income','รายรับ'],['expense','Expenses','ค่าใช้จ่าย'],['refund','Refunds','คืนเงิน']] as const).map(([value,en,th])=>
     <Link key={value} href={financeUrl('records',dates,{kind:value,q:query,sort})} aria-current={kind===value?'true':undefined}>{l(en,th)}</Link>)}
   </nav>
   <details className="finance-record-options">
    <summary>{l('More filters','ตัวกรองเพิ่มเติม')}</summary>
    <div className="finance-fields">
     <label>{l('Transaction type','ประเภทรายการ')}<select name="kind" defaultValue={kind}><option value="">{l('All types','ทุกประเภท')}</option>
      {Object.keys(modules).map(value=><option value={value} key={value}>{code(value,l)}</option>)}</select></label>
     <label>{l('Sort transactions','เรียงรายการ')}<select name="sort" defaultValue={sort}><option value="new">{l('Newest first','ใหม่ก่อน')}</option><option value="old">{l('Oldest first','เก่าก่อน')}</option></select></label>
    </div>
   </details>
  </form>}
  {records.length?<ul className="finance-transaction-list">{records.map(row=>{
   const type=String(row.kind);
   const Icon=categoryIcons[type]??Wallet;
   const amount=Number(row.amount_satang);
   const name=String(row.notes||code(type,l));
   const day=String(row.occurred_on);
   const date=new Intl.DateTimeFormat(locale,{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(day+'T00:00:00Z'));
   return <li key={String(row.id)+type}><details>
    <summary className="finance-transaction"><span className={'finance-transaction-icon '+(amount<0?'out':'in')}><Icon size={19}/></span>
     <span className="finance-transaction-copy"><strong>{name}</strong><small><time dateTime={day}>{date}</time> · {code(type,l)}</small></span>
     <span className={'finance-transaction-value '+(amount>0?'positive':'')}><strong>{amount>0?'+':''}{thb(amount,locale)}</strong>
      <small>{String(row.account??'')}</small></span><ChevronDown size={14} className="finance-transaction-chevron"/></summary>
    <div className="finance-transaction-detail"><p>{l('Payment account','บัญชีชำระเงิน')} <strong>{String(row.account??'—')}</strong></p>
     <Link href={financeUrl(modules[type]??'cash',{from:day,to:day,range:'custom'},row.id&&['receipt','refund','expense','filament_purchase','equipment','team_payout'].includes(type)?{record:String(row.id)}:{})}>
      {l('Open register','เปิดทะเบียนรายการ')} <ArrowRight size={15}/></Link></div>
   </details></li>;
  })}</ul>:<div className="finance-list-empty"><span><ReceiptText size={22}/></span><strong>{l('No transactions yet','ยังไม่มีรายการ')}</strong>
   <p>{l('Add a record or select another period.','เพิ่มรายการหรือเลือกช่วงเวลาอื่น')}</p></div>}
  {full&&count>25&&<div className="finance-paging">
   {page>1&&<Link href={financeUrl('records',dates,{q:query,kind,sort,page:String(page-1)})}>{l('Previous','ก่อนหน้า')}</Link>}
   <span>{(page-1)*25+1}–{Math.min(page*25,count)} / {count}</span>
   {page*25<count&&<Link href={financeUrl('records',dates,{q:query,kind,sort,page:String(page+1)})}>{l('Next','ถัดไป')}</Link>}
  </div>}
 </section>;
}
export function TeamCards({members,thai,l,dates}:{members:TeamSummary[];thai:boolean;l:L;dates:Filters}) {
 const locale=thai?'th':'en';
 return <section className="finance-team-summary"><header className="finance-section-head"><div><h2>{l('Profit allocation','การจัดสรรกำไร')}</h2>
  <p>{l('Accrued amounts for the selected period. Rates shown as of its end.','ยอดจัดสรรในช่วงที่เลือก อัตราส่วนแบ่ง ณ วันสิ้นช่วง')}</p></div>
  <Link className="finance-button" href={financeUrl('settings',dates)+'#agreements'}>{l('Share settings','ตั้งค่าส่วนแบ่ง')} <ChevronRight size={15}/></Link></header>
  <div className="finance-team-cards">{members.map(member=><article className="finance-panel finance-team-card" key={member.id}>
   <div><span className="finance-person-icon">{member.owner?<CircleDollarSign size={20}/>:<UsersRound size={20}/>}</span>
    <div><h3>{member.owner?l('Owner','เจ้าของ'):member.name}</h3>{member.points!==undefined&&<p>{new Intl.NumberFormat(locale,{style:'percent',maximumFractionDigits:2}).format(member.points/10000)}</p>}</div></div>
   <strong>{thb(member.share,locale)}</strong>
   {!member.owner&&<dl><div><dt>{l('Paid','จ่ายแล้ว')}</dt><dd>{thb(member.paid,locale)}</dd></div><div><dt>{l('Unpaid','ค้างจ่าย')}</dt><dd>{thb(member.unpaid,locale)}</dd></div></dl>}
  </article>)}</div>
 </section>;
}
