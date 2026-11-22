import {financePreferences} from './preferences';
import {FinanceSecurity} from './passkeys';
import Link from 'next/link';
import {ArrowDownLeft, ArrowUpRight, CalendarDays, ChartNoAxesCombined, CircleDollarSign, Coins, HandCoins, Landmark, TrendingUp, UsersRound, Wallet} from 'lucide-react';
import {financeAdmin,overview,rows,type Row,type Stats} from './data';
import {baht,bangkokToday,day,payoutName,period,sections,thb,type Filters,type L,type Section,type CostInput} from './model';
import {localized,moduleCopy,sectionTables,tables,type Column,type Table} from './sections';
import {code,definitions,type Form,type Lookups} from './forms';
import {Entry,QuickCalculator} from './entry';
import {AnalyticsCharts,Graphs} from './graphs';
import {reports} from './reports';
import {FinanceChrome,FinancePreferences} from './chrome';
import {EmailSettings} from './email/settings';
import {MembershipPanel,type MembershipList} from './access-panel';
import {financeOwner} from './membership';
import {FinanceSignOut} from './login/screen';
import {GoalPreview,Goals} from './goals';
import {Balance,DashboardActions,RecentTransactions,financeUrl} from './panels';
import {financeAnalytics,financeInvestments} from './analytics';
import {financeLookups} from './lookups';
import {PayoutCards,type PayoutMonth} from './payouts';
import './finance.css';

export const dynamic='force-dynamic';
export const metadata={title:'Finance',robots:{index:false,follow:false}};
type Query = Record<string,string|string[]|undefined>;
async function OwnerSettings({thai,page}:{thai:boolean;page:number}) {
 const owner=await financeOwner();
 if(!owner)return null;
 const {data,error}=await owner.db.rpc('finance_membership_admin' as never,{p_offset:(page-1)*25} as never);
 if(error)return <p role="alert">{thai?'โหลดรายการอนุมัติไม่ได้':'Account approvals could not be loaded.'}</p>;
 return <MembershipPanel thai={thai} page={page} data={data as unknown as MembershipList}/>;
}
const metrics = [
 ['revenue','Recognized revenue','รายได้ที่รับรู้'],['operating','Operating expenses','ค่าใช้จ่ายดำเนินงาน'],
 ['gross','Gross profit','กำไรขั้นต้น'],['net','Net profit before team shares','กำไรสุทธิก่อนแบ่งทีม'],
 ['team','Team shares accrued','ส่วนแบ่งทีมค้างรับ'],['ownerRemaining','Owner profit after team shares','กำไรเจ้าของหลังแบ่งทีม'],
 ['cash','Cash balance','เงินสดคงเหลือ'],['receivable','Receivables','ลูกหนี้'],
 ['stock','Filament inventory value','มูลค่าคลังเส้นพิมพ์'],['investment','Business investment','เงินลงทุนธุรกิจ'],
 ['assets','Equipment book value','มูลค่าอุปกรณ์ตามบัญชี'],['payable','Supplier bills due','เจ้าหนี้ค้างชำระ'],
 ['invoiced','Invoiced sales','ยอดเรียกเก็บ'],['received','Cash received, net','เงินรับสุทธิ'],
 ['teamPaid','Team shares paid','ส่วนแบ่งที่จ่ายแล้ว'],['ownerAllocation','Owner allocation','ส่วนจัดสรรเจ้าของ'],
 ['withdrawals','Owner withdrawals','เงินถอนเจ้าของ'],['directCost','Direct costs','ต้นทุนทางตรง'],
 ['depreciation','Depreciation','ค่าเสื่อมราคา'],['teamPayable','Team payouts due','ส่วนแบ่งทีมค้างจ่าย'],
 ['totalExpenses','Total expenses','ค่าใช้จ่ายรวม'],
] as const;
const metricIcons:Record<string,typeof Wallet>={revenue:ArrowDownLeft,totalExpenses:ArrowUpRight,operating:ArrowUpRight,net:TrendingUp,cash:Wallet,
 team:UsersRound,teamPayable:UsersRound,ownerAllocation:CircleDollarSign,ownerRemaining:CircleDollarSign,stock:Coins,investment:Landmark};
const show = (value:Row[string], l:L, locale:string, key:string, type?:Column[2]) => {
 if(value===null||value===undefined||value==='')return '—';
 if(type==='money')return thb(value,locale);
 if(type==='grams')return new Intl.NumberFormat(locale,{maximumFractionDigits:4}).format(Number(value)/(key==='satang_per_gram'?100:1));
 if(type==='code')return code(String(value),l);
 if(type==='state') {
  const states:Record<string,[string,string]>={open:['Open','เปิด'],recognized:['Recognized','รับรู้แล้ว'],cancelled:['Cancelled','ยกเลิก'],
   paid:['Paid','จ่ายแล้ว'],pending:['Pending','รอจ่าย'],partial:['Partial','จ่ายบางส่วน'],voided:['Voided','ยกเลิก'],owner:['Owner','เจ้าของ'],
   true:['Active','ใช้งาน'],false:['Inactive','ปิดใช้งาน']};
  return <span className={'finance-state state-'+String(value)}>{states[String(value)]?l(...states[String(value)]):String(value)}</span>;
 }
 return String(value);
};
function MetricList({data,keys,l,thai}:{data:Stats;keys:string[];l:L;thai:boolean}) {
 const values={...data,totalExpenses:data.directCost+data.operating+data.depreciation};
 const [prior,latest]=data.monthly.slice(-2);
 const comparison=prior&&latest?{revenue:[prior.revenue,latest.revenue],totalExpenses:[prior.costs,latest.costs],net:[prior.profit,latest.profit]}:{};
 const percent=new Intl.NumberFormat(thai?'th':'en',{style:'percent',maximumFractionDigits:0,signDisplay:'exceptZero'});
 return <dl className="finance-metrics">{keys.map(key=>{
  const metric=metrics.find(([id])=>id===key);
  if(!metric)return null;
  const Icon=metricIcons[key]??HandCoins;
  const change=comparison[key as keyof typeof comparison];
  const trend=change&&change[0]!==0?(change[1]-change[0])/Math.abs(change[0]):null;
  return <div className={'finance-metric metric-'+key} key={key}><dt><span className="finance-metric-icon"><Icon size={16}/></span>{l(metric[1],metric[2])}</dt>
   <dd>{thb(values[key as keyof typeof values],thai?'th':'en')}</dd>
   {trend!==null&&<small className="finance-trend">{percent.format(trend)} {l('vs prior month','เทียบเดือนก่อน')}</small>}</div>;
 })}</dl>;
}
function DateControl({section,dates,l}:{section:Section;dates:Filters;l:L}) {
 const choices=[['today','Today','วันนี้'],['week','Last 7 days','7 วันล่าสุด'],['month','This month','เดือนนี้'],['year','This year','ปีนี้']];
 return <div className="finance-filters" id="finance-period"><div className="finance-periods" aria-label={l('Date range','ช่วงวันที่')}>
  {choices.map(([value,en,th])=><Link key={value} href={'/finance?'+new URLSearchParams({section,range:value})} aria-current={dates.range===value?'true':undefined}>{l(en,th)}</Link>)}
 </div><details className="finance-custom-period" open={dates.range==='custom'||undefined}><summary aria-label={l('Custom range','กำหนดช่วงวันที่')}><CalendarDays size={16}/><span>{l('Custom range','กำหนดช่วงวันที่')}</span></summary><form method="get" action="/finance" className="finance-date-form">
  <input type="hidden" name="section" value={section}/><input type="hidden" name="range" value="custom"/>
  <label>{l('From','ตั้งแต่')}<input type="date" name="from" required defaultValue={dates.from}/></label>
  <label>{l('To','ถึง')}<input type="date" name="to" required defaultValue={dates.to}/></label>
  <button className="finance-button">{l('Apply','ใช้ช่วงวันที่')}</button>
 </form></details></div>;
}
function TablePanel({table,data,count,section,dates,l,thai,query,sort,page,forms,editable,edit}:{table:Table;data:Row[];count:number;section:Section;dates:Filters;l:L;thai:boolean;query:string;sort:string;page:number;forms?:(row:Row)=>Form[];editable?:boolean;edit?:{id:string;form:Form;initial:Record<string,string>}}) {
 const fixed={section,range:dates.range,from:dates.from,to:dates.to,table:table.id};
 const uri=(more:Record<string,string>)=>'/finance?'+new URLSearchParams({...fixed,q:query,sort,...more})+'#'+table.id;
 const derived=(row:Row):Row=>({...row,
  order_state:row.cancelled_on?'cancelled':row.recognized_on?'recognized':'open',
  expense_state:row.voided?'voided':row.paid_on?'paid':'pending',
  payout_state:row.member_id?(Number(row.remaining_satang)===0?'paid':Number(row.paid_satang)>0?'partial':'pending'):'owner',
 });
 return <section id={table.id} className="finance-panel finance-register"><header className="finance-panel-head"><h2>{localized(l,table.title)}</h2>
  <form method="get" action={'/finance#'+table.id} className="finance-table-filter">
   {Object.entries(fixed).map(([key,value])=><input key={key} type="hidden" name={key} value={value}/>)}
   {table.search&&<input name="q" aria-label={l('Search records','ค้นหารายการ')} placeholder={l('Search records','ค้นหารายการ')} defaultValue={query} maxLength={120}/>}
   <select name="sort" aria-label={l('Sort records','เรียงรายการ')} defaultValue={sort}><option value="new">{l('Newest first','ใหม่ก่อน')}</option><option value="old">{l('Oldest first','เก่าก่อน')}</option></select>
   <button className="finance-button">{l('Filter','กรอง')}</button>
  </form>
 </header>
 {edit&&<div className="finance-inline-edit"><Entry key={edit.id} form={edit.form} thai={thai} target={edit.id} initial={edit.initial} summary={false}/><Link href={uri({})}>{l('Close editor','ปิดตัวแก้ไข')}</Link></div>}
 {data.length>0?<div className="finance-table-scroll" tabIndex={0} role="region" aria-label={localized(l,table.title)}><table><thead><tr>{table.columns.map(([key,title])=><th key={key} scope="col">{localized(l,title)}</th>)}
  {(forms||editable||['orders','jobs'].includes(table.id))&&<th scope="col">{l('Details and actions','รายละเอียดและการดำเนินการ')}</th>}</tr></thead>
 <tbody>{data.map(row=>{
  const id=String(row.id);
  const actions=forms?.(row)??[];
  const canEdit=editable&&(table.id!=='orders'||(!row.recognized_on&&!row.cancelled_on&&!row.received_satang));
  return <tr key={id+String(row.kind??'')}>{table.columns.map(([key,title,type])=><td key={key} data-format={type} data-label={localized(l,title)}>{show(derived(row)[key],l,thai?'th':'en',key,type)}</td>)}
   {(forms||editable||['orders','jobs'].includes(table.id))&&<td>
    {canEdit&&<Link className="finance-edit-link" href={uri({edit:id})}>{l('Edit','แก้ไข')}</Link>}
    {table.id==='orders'&&<Link className="finance-edit-link" href={uri({order:id})}>{l('Open order','เปิดคำสั่งซื้อ')}</Link>}
    {table.id==='jobs'&&row.finished_on&&<Link className="finance-edit-link" href={uri({job:id})}>{l('Cost breakdown','รายละเอียดต้นทุน')}</Link>}
    {actions.map(action=><Entry key={action.action} thai={thai} target={id} form={action} defaults={table.id==='jobs'?row.estimate as unknown as CostInput:undefined}/>)}</td>}
   </tr>;
 })}</tbody></table></div>:<p className="finance-empty">{l('No entries match this view.','ไม่มีรายการที่ตรงกับมุมมองนี้')}</p>}
 {count>25&&<footer className="finance-paging">{page>1&&<Link href={uri({page:String(page-1)})}>{l('Previous','ก่อนหน้า')}</Link>}
  <span>{(page-1)*25+1}–{Math.min(count,page*25)} / {count}</span>{page*25<count&&<Link href={uri({page:String(page+1)})}>{l('Next','ถัดไป')}</Link>}</footer>}
 </section>;
}
const needed:Partial<Record<Section,(keyof Lookups)[]>>={
 orders:['accounts','sales'],income:['accounts','sales','orders'],expenses:['accounts','expenses','orders','recurring'],
 inventory:['accounts'],calculator:['orders','spools'],team:['accounts'],investments:['accounts','assets'],cash:['accounts'],settings:['members'],
};
export default async function FinancePage({searchParams}:{searchParams:Promise<Query>}) {
 const [db,{locale},query]=await Promise.all([financeAdmin(),financePreferences(),searchParams]);
 const thai=locale==='th',l:L=(en,th)=>thai?th:en;
 const requested=typeof query.section==='string'?query.section:'overview';
 const section:Section=Object.hasOwn(sections,requested)?requested as Section:'overview';
 const today=bangkokToday(),filtered=period(query);
 const activeTable=typeof query.table==='string'?query.table:'';
 const text=typeof query.q==='string'?query.q.trim().slice(0,120):'';
 const page=typeof query.page==='string'&&/^\d{1,5}$/.test(query.page)?Math.max(1,Number(query.page)):1;
 const sort=query.sort==='old'?'old':'new';
 const includesStats=['overview','profit','income','cash','reports','investments'].includes(section);
 const kind=typeof query.kind==='string'&&/^[a-z_]{1,30}$/.test(query.kind)?query.kind:'';
 const record=typeof query.record==='string'&&/^[0-9a-f-]{36}$/i.test(query.record)?query.record:'';
 const linkedMonth=section==='team'&&record?await payoutRecordMonth(db,record):null;
 const requestedMonth=typeof query.month==='string'&&/^\d{4}-\d{2}$/.test(query.month)?query.month+'-01':'';
 const selectedMonth=linkedMonth??(day.safeParse(requestedMonth).success&&requestedMonth<=today?requestedMonth:
  (filtered.to<=today?filtered.to:today).slice(0,7)+'-01');
 const historyPage=activeTable==='allocations'?1:page;
 const monthEnd=new Date(selectedMonth+'T00:00:00Z');
 monthEnd.setUTCMonth(monthEnd.getUTCMonth()+1,0);
 const lastDay=monthEnd.toISOString().slice(0,10);
 const dates=section==='team'?{from:selectedMonth,to:lastDay<today?lastDay:today,range:'custom'}:filtered;
 const tableIds=sectionTables[section]??[];
 const [stats,registers,lookups,transactions,analytics,team,investments,goals]=await Promise.all([
  includesStats?overview(db,dates):null,
  Promise.all(tableIds.map(id=>{const table=tables[id];const selectedRecord=record&&['income','expenses','stock','assets','payouts'].includes(id);
   const byPeriod=Boolean(query.range)&&!selectedRecord&&!['agreements','stock'].includes(id);
   return rows(db,table.relation,{date:table.date,dates:id==='allocations'?{...dates,from:dates.from.slice(0,7)+'-01'}:byPeriod?dates:undefined,
    sort:table.sort,ascending:table.sort==='name'?sort!=='old':sort==='old',search:table.search,query:activeTable===id?text:undefined,page:activeTable===id?page:1,
    match:selectedRecord?{id:record}:undefined});})),
  financeLookups(db,needed[section]??[]),
  section==='overview'||section==='records' ? rows(db,'finance_cash_register',{date:'occurred_on',dates,size:section==='records'?25:5,
   page:section==='records'?page:1,sort:'occurred_on',ascending:section==='records'&&sort==='old',
   search:'notes',query:section==='records'?text:undefined,match:section==='records'&&kind?{kind}:undefined}):null,
  section==='profit'||section==='reports'?financeAnalytics(db,dates):null,
  section==='team'?loadPayoutMonth(db,selectedMonth,historyPage):null,
  section==='investments'?financeInvestments(db,dates):null,
  section==='overview'?rows(db,'finance_goals',{sort:'created_at',match:{completed:false},size:1}):
   section==='goals'?rows(db,'finance_goals',{sort:'created_at',page}):null,
 ]);
 const {sectionForms,rowForms,editable}=definitions(l,lookups,today);
 const editId=typeof query.edit==='string'?query.edit:'';
 const selected=tableIds.includes(activeTable)&&/^[0-9a-f-]{36}$/i.test(editId)&&activeTable in editable
  ? registers[tableIds.indexOf(activeTable)].data.find(row=>row.id===editId):undefined;
 let edit:{id:string;form:Form;initial:Record<string,string>}|undefined;
 if(selected) {
  const source=editable[activeTable as keyof typeof editable];
  const form={...source,title:l('Edit record','แก้ไขรายการ')};
  const initial:Record<string,string>={description:String(selected.name??''),amount:baht(selected.amount_satang??selected.default_satang),
   vendor:String(selected.vendor??''),eligible:String(selected.eligible??true),enabled:String(selected.enabled??true),
   account:String(selected.account_id??''),category:String(selected.category_id??''),kind:String(selected.kind??''),
   reference:String(selected.reference??''),customer:String(selected.customer??''),contact:String(selected.contact??''),day:String(selected.booked_on??today),notes:String(selected.notes??'')};
  if(activeTable==='orders'&&form.repeat) {
   const lines=await rows(db,'finance_order_lines',{match:{order_id:editId},size:25});
   form.repeat={...form.repeat,initial:lines.data.map(line=>({category:String(line.category_id),description:String(line.description),quantity:String(line.quantity),
    unit:baht(line.unit_satang),discount:baht(line.discount_satang),fee:baht(line.fee_satang)}))};
  }
  edit={id:editId,form,initial};
 }
 const detail=typeof query.order==='string'&&section==='orders'&&/^[0-9a-f-]{36}$/i.test(query.order)
  ? await Promise.all([rows(db,'finance_order_summary',{match:{id:query.order},size:1}),rows(db,'finance_order_lines',{match:{order_id:query.order},size:25}),rows(db,'finance_job_summary',{match:{order_id:query.order},size:25})]):null;
 const currentOrder=detail?.[0].data[0];
 const selectedJob=typeof query.job==='string'&&section==='calculator'&&/^[0-9a-f-]{36}$/i.test(query.job)
  ? (await rows(db,'finance_job_summary',{match:{id:query.job},size:1})).data[0]:null;
 const headerTitle=section==='profit'?l('Financial reports','รายงานการเงิน'):localized(l,sections[section]);
 const reportArgs=new URLSearchParams({from:dates.from,to:dates.to,range:'custom'});
 const overviewMetrics=['revenue','totalExpenses','net','cash','teamPayable','ownerAllocation'];
 const scopedMetrics=section==='cash'?['cash','receivable','payable','teamPayable','received','withdrawals']:
  section==='income'?['invoiced','revenue','received','receivable']:overviewMetrics;
 const formatDate = new Intl.DateTimeFormat(thai?'th':'en-GB',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
 const periodLabel = dates.from===dates.to?formatDate.format(new Date(dates.to+'T00:00:00Z')):
  formatDate.formatRange(new Date(dates.from+'T00:00:00Z'),new Date(dates.to+'T00:00:00Z'));
 return <FinanceChrome section={section} thai={thai} dates={dates} title={headerTitle} period={periodLabel}>
   <header className="finance-heading"><div><h1>{headerTitle}</h1>
    {moduleCopy[section]&&<p>{localized(l,moduleCopy[section])}</p>}</div>
    {section==='profit'&&<Link href={financeUrl('reports',dates)} className="finance-button"><ChartNoAxesCombined size={17}/>{l('Reports','รายงาน')}</Link>}</header>
   {!['overview','goals','settings','team'].includes(section)&&<DateControl section={section} dates={dates} l={l}/>}
   {stats&&section==='overview'&&<div className="finance-dashboard">
    <div className="finance-dashboard-main"><Balance data={stats} l={l} thai={thai}/><DashboardActions dates={dates} l={l}/>
     <GoalPreview goal={goals?.data[0]} thai={thai} href={financeUrl('goals',dates)}/></div>
    <RecentTransactions records={transactions?.data??[]} l={l} thai={thai} dates={dates}/>
   </div>}
   {stats&&section==='overview'&&<><DateControl section={section} dates={dates} l={l}/><MetricList data={stats} keys={overviewMetrics} l={l} thai={thai}/></>}
   {section==='goals'&&goals&&<>
    <Goals goals={goals.data} thai={thai}/>
    {goals.count>25&&<div className="finance-paging">
     {page>1&&<Link href={financeUrl('goals',dates,{page:String(page-1)})}>{l('Previous','ก่อนหน้า')}</Link>}
     <span>{(page-1)*25+1}–{Math.min(page*25,goals.count)} / {goals.count}</span>
     {page*25<goals.count&&<Link href={financeUrl('goals',dates,{page:String(page+1)})}>{l('Next','ถัดไป')}</Link>}
    </div>}
   </>}
   {stats&&section!=='reports'&&section!=='overview'&&section!=='investments'&&section!=='profit'&&<MetricList data={stats} keys={scopedMetrics} l={l} thai={thai}/>}
   {stats&&investments&&<dl className="finance-metrics">
    {([
     [stats.investment,l('Capital invested to date','เงินลงทุนสะสม'),Landmark],
     [investments.purchases,l('Equipment purchases in period','ซื้ออุปกรณ์ในช่วง'),Coins],
     [investments.contributions,l('Owner contributions in period','เงินทุนเจ้าของในช่วง'),HandCoins],
    ] as const).map(([value,label,Icon])=><div key={label} className="finance-metric"><dt><span className="finance-metric-icon"><Icon size={16}/></span>{label}</dt><dd>{thb(value,thai?'th':'en')}</dd></div>)}
   </dl>}
   {stats&&section==='overview'&&<><Graphs data={stats} thai={thai}/><MetricList data={stats} keys={['gross','operating','ownerRemaining','receivable','stock','investment','assets']} l={l} thai={thai}/></>}
   {stats&&analytics&&section==='profit'&&<>
    <MetricList data={stats} keys={['revenue','totalExpenses']} l={l} thai={thai}/>
    <AnalyticsCharts data={stats} analytics={analytics} range={dates.range} thai={thai}/>
    <Link href={financeUrl('reports',dates)} className="finance-button finance-mobile-reports"><ChartNoAxesCombined size={17}/>{l('Reports and downloads','รายงานและดาวน์โหลด')}</Link>
    <MetricList data={stats} keys={['net','directCost','gross','operating','depreciation','team','ownerRemaining']} l={l} thai={thai}/>
   </>}
   {section==='records'&&<>
    <RecentTransactions records={transactions?.data??[]} l={l} thai={thai} dates={dates} full query={text} kind={kind} sort={sort} count={transactions?.count??0} page={page}/>
    <nav className="finance-module-links" aria-label={l('Financial registers','ทะเบียนการเงิน')}>{(['orders','income','expenses','investments','cash','inventory','calculator'] as const).map(key=><Link className="finance-button" key={key} href={financeUrl(key,dates)}>{localized(l,sections[key])}</Link>)}</nav>
   </>}
   {team&&<TeamPayouts db={db} data={team} dates={dates} lastDay={lastDay} today={today} thai={thai} l={l}
    lookups={lookups} ledgerPage={activeTable==='allocations'?page:1} historyPage={historyPage}
    allocationForms={rowForms.allocations} close={sectionForms.team?.[0]} ledgerQuery={activeTable==='allocations'?text:''}
    ledgerSort={activeTable==='allocations'?sort:'new'} showLedger={activeTable==='allocations'}/>}
   {section==='settings'&&<><FinancePreferences thai={thai}/><FinanceSecurity thai={thai}/>
    <OwnerSettings thai={thai} page={typeof query.membersPage==='string'&&/^\d{1,4}$/.test(query.membersPage)?Math.max(1,Number(query.membersPage)):1}/>
    <EmailSettings thai={thai}/><FinanceSignOut thai={thai}/><nav className="finance-module-links" aria-label={l('Finance shortcuts','ทางลัดการเงิน')}>
    <Link className="finance-button" href={financeUrl('team',dates)}>{l('Team Payouts','จ่ายส่วนแบ่งทีม')}</Link>
    <Link className="finance-button" href={financeUrl('records',dates)}>{l('Financial records','รายการการเงิน')}</Link>
   </nav></>}
   {stats&&section==='cash'&&<section className="finance-panel"><h2>{l('Account balances','ยอดคงเหลือตามบัญชี')}</h2><dl className="finance-cost-results">{stats.accounts.map(account=><div key={account.name}><dt>{account.name}</dt><dd>{thb(account.balance,thai?'th':'en')}</dd></div>)}</dl></section>}
   {section==='calculator'&&<div id="entry"><QuickCalculator thai={thai}/></div>}
   {section!=='team'&&sectionForms[section]&&<section className="finance-panel finance-entries" id={section==='calculator'?undefined:'entry'}>
    <h2>{l('Record activity','บันทึกรายการ')}</h2>{sectionForms[section].map(form=><Entry form={form} thai={thai} key={form.title}/>)}
   </section>}
   {currentOrder&&detail&&<section className="finance-panel"><h2>{String(currentOrder.reference)} · {String(currentOrder.customer)}</h2>
    <p>{String(currentOrder.contact??'')} {String(currentOrder.notes??'')}</p>
    <dl className="finance-cost-results">{tables.profitability.columns.filter(([, ,type])=>type==='money'||type==='grams').map(([key,title,type])=><div key={key}><dt>{localized(l,title)}</dt><dd>{show(currentOrder[key],l,thai?'th':'en',key,type)}</dd></div>)}</dl>
    {detail[1].data.map(line=><p key={String(line.id)}>{String(line.description)} × {String(line.quantity)} · {thb(line.total_satang,thai?'th':'en')}</p>)}
    {detail[2].data.map(job=><p key={String(job.id)}><Link href={'/finance?section=calculator&job='+job.id}>{String(job.printer)} · {thb(job.actual_satang??job.estimated_satang,thai?'th':'en')}</Link></p>)}
   </section>}
   {selectedJob&&<section className="finance-panel"><h2>{l('Production cost detail','รายละเอียดต้นทุนผลิต')} · {String(selectedJob.reference)}</h2>
    <dl className="finance-cost-results">{tables.jobs.columns.slice(2).map(([key,title,type])=><div key={key}><dt>{localized(l,title)}</dt><dd>{show(selectedJob[key],l,thai?'th':'en',key,type)}</dd></div>)}</dl></section>}
   {tableIds.map((id,index)=><TablePanel key={id} table={tables[id]} data={registers[index].data} count={registers[index].count} section={section} dates={dates} l={l} thai={thai}
    query={activeTable===id?text:''} page={activeTable===id?page:1} sort={activeTable===id?sort:'new'} forms={rowForms[id]} editable={id in editable} edit={activeTable===id?edit:undefined}/>)}
   {section==='reports'&&stats&&<>
    <MetricList data={stats} keys={overviewMetrics} l={l} thai={thai}/>
    {analytics&&<AnalyticsCharts data={stats} analytics={analytics} range={dates.range} thai={thai}/>}
    <section className="finance-panel finance-reports"><h2>{l('Download reports','ดาวน์โหลดรายงาน')}</h2>
     {Object.entries(reports).map(([id,title])=><div key={id}><strong>{localized(l,title)}</strong><span>
      <a className="finance-button" href={'/finance/export?'+reportArgs+'&report='+id+'&format=xlsx'}>Excel</a>
      <a className="finance-button" href={'/finance/export?'+reportArgs+'&report='+id+'&format=csv'}>CSV</a>
      {['yearly','profit'].includes(id)&&<Link className="finance-button" href={'/finance/print?'+reportArgs+'&report='+id}>{l('Print / PDF','พิมพ์ / PDF')}</Link>}</span></div>)}</section>
   </>}
 </FinanceChrome>;
}

type FinanceDB=Awaited<ReturnType<typeof financeAdmin>>;
async function payoutRecordMonth(db:FinanceDB,id:string) {
 const record=(await rows(db,'finance_payout_register',{match:{id},size:1})).data[0];
 if(!record)return null;
 const allocation=(await rows(db,'finance_payout_summary',{match:{id:String(record.allocation_id)},size:1})).data[0];
 return typeof allocation?.month==='string'?allocation.month:null;
}
async function loadPayoutMonth(db:FinanceDB,month:string,page:number) {
 const {data,error}=await db.rpc('finance_month_payout_page' as never,{p_month:month,p_offset:(page-1)*25} as never);
 if(error)throw Error(error.message);
 return data as unknown as PayoutMonth;
}
async function TeamPayouts({db,data,dates,today,lastDay,thai,l,lookups,ledgerPage,historyPage,allocationForms,close,ledgerQuery,ledgerSort,showLedger}:{
 db:FinanceDB;data:PayoutMonth;dates:Filters;today:string;lastDay:string;thai:boolean;l:L;lookups:Lookups;
 ledgerPage:number;historyPage:number;allocationForms:(row:Row)=>Form[];close?:Form;ledgerQuery:string;ledgerSort:string;showLedger:boolean;
}) {
 const month=dates.from.slice(0,7),locale=thai?'th':'en-GB';
 const dateFormat=new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeZone:'UTC'});
 const historyHref=(page:number)=>'/finance?'+new URLSearchParams({section:'team',month,page:String(page)})+'#payout-history';
 const ledger=data.closed?await rows(db,'finance_payout_summary',{date:'month',dates:{...dates,to:dates.from},page:ledgerPage,
  search:'name_snapshot',query:ledgerQuery,ascending:ledgerSort==='old'}):null;
 const net=Number(data.net);
 return <>
  <section className="finance-panel finance-payout-period" id="finance-period">
   <div><h2>{l('Net profit','กำไรสุทธิ')}</h2><strong>{thb(data.net,locale)}</strong>
    <p className="finance-muted">{l('Before profit distributions','ก่อนจ่ายส่วนแบ่งกำไร')}</p></div>
   <form method="get" action="/finance" className="finance-date-form">
    <input type="hidden" name="section" value="team"/>
    <label>{l('Profit month','เดือนกำไร')}<input type="month" name="month" min="2000-01" max={today.slice(0,7)} defaultValue={month} required/></label>
    <button className="finance-button">{l('View month','ดูเดือน')}</button>
   </form>
  </section>
  {net<=0?<p className="finance-muted">{l('No payouts are available for a month with zero profit or a loss.','เดือนไม่มีกำไรหรือขาดทุน ไม่สามารถจ่ายส่วนแบ่งได้')}</p>:
   data.frozen?<p className="finance-muted">{l('This period was frozen by a later close.','งวดนี้ถูกล็อกโดยการปิดเดือนถัดไป')}</p>:
   !data.closed&&<p className="finance-muted">{l('These shares are estimates. Close the month to finalize them and record payments.','ยอดส่วนแบ่งเป็นประมาณการ ปิดเดือนเพื่อยืนยันและบันทึกการจ่าย')}</p>}
  {net>0&&data.recipients.some(item=>Number(item.share)>0)&&data.recipients.reduce((total,item)=>total+BigInt(item.share),0n)!==BigInt(data.net)&&
   <p className="finance-muted">{l('Shares use the profit basis in the agreement.','ยอดส่วนแบ่งใช้ฐานกำไรตามข้อตกลง')}</p>}
  <PayoutCards key={month} data={data} month={dates.from} today={today} lastDay={lastDay} accounts={lookups.accounts} thai={thai}/>
  {data.canClose&&close&&<section className="finance-panel finance-entries"><Entry thai={thai} form={{...close,
   fields:close.fields.map(field=>({...field,value:dates.from,min:dates.from,max:dates.from}))}}/></section>}
  {!data.closed&&!data.frozen&&data.requiredCloseMonth&&<Link className="finance-button" href={'/finance?section=team&month='+data.requiredCloseMonth}>
   {l('Open the earliest month awaiting close','เปิดเดือนแรกที่รอปิดงวด')}</Link>}
  <section className="finance-panel finance-register" id="payout-history">
   <h2>{l('Payment history','ประวัติการจ่าย')}</h2>
   {data.history.length>0?<ul className="finance-payout-history">{data.history.map(payment=><li key={payment.id}>
    <div><strong>{payoutName(payment.recipient,thai)}</strong>
     {payment.kind==='owner'&&<small>{l('Owner withdrawal','เงินถอนเจ้าของ')}</small>}
     {payment.kind==='unlinked'&&<small>{l('Withdrawal without an assigned profit month','เงินถอนที่ยังไม่ผูกกับเดือนกำไร')}</small>}
     <time dateTime={payment.day}>{dateFormat.format(new Date(payment.day+'T00:00:00Z'))}</time></div>
    <strong>{thb(payment.amount,locale)}</strong>
   </li>)}</ul>:<p className="finance-muted">{l('No payments recorded for this month.','ยังไม่มีการจ่ายสำหรับเดือนนี้')}</p>}
   {data.historyCount>25&&<div className="finance-paging">
    {historyPage>1&&<Link href={historyHref(historyPage-1)}>{l('Previous','ก่อนหน้า')}</Link>}
    <span>{(historyPage-1)*25+1}–{Math.min(historyPage*25,data.historyCount)} / {data.historyCount}</span>
    {historyPage*25<data.historyCount&&<Link href={historyHref(historyPage+1)}>{l('Next','ถัดไป')}</Link>}
   </div>}
  </section>
  <details className="finance-panel finance-payout-advanced" open={showLedger||undefined}>
   <summary>{l('Allocations and agreements','รายการจัดสรรและข้อตกลง')}</summary>
   <Link className="finance-button" href={financeUrl('settings',dates)+'#agreements'}>{l('Share settings','ตั้งค่าส่วนแบ่ง')}</Link>
   {ledger&&<TablePanel table={tables.allocations} data={ledger.data} count={ledger.count} section="team" dates={dates}
    l={l} thai={thai} query={ledgerQuery} sort={ledgerSort} page={ledgerPage} forms={allocationForms}/>}
  </details>
 </>;
}
