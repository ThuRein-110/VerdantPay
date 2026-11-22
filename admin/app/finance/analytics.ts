import 'server-only';
import type {Filters} from './model';
import {rows,type financeAdmin} from './data';

type Database=Awaited<ReturnType<typeof financeAdmin>>;
export type PeriodPoint={day:string;revenue:number;expenses:number;profit:number};
export type Spending={category:string;amount:number};
export type Analytics={daily:PeriodPoint[];weekly:PeriodPoint[];spending:Spending[]};
function add<K>(values:Map<K,bigint>,key:K,amount:bigint) {
 values.set(key,(values.get(key)??0n)+amount);
}
const integers=(value:unknown)=>BigInt(typeof value==='number'||typeof value==='string'?value:0);

export async function financeInvestments(db:Database,dates:Filters) {
 const total=async(relation:string,date:string,amount:string,match?:Record<string,string>)=>{
  let sum=0n;
  for(let page=1;;page++){
   const batch=await rows(db,relation,{date,dates,match,size:500,page});
   for(const row of batch.data)sum+=integers(row[amount]);
   if(page*500>=batch.count)return String(sum);
  }
 };
 const [purchases,contributions]=await Promise.all([
  total('finance_assets','acquired_on','purchase_satang'),
  total('finance_capital','occurred_on','amount_satang',{kind:'owner_contribution'}),
 ]);
 return {purchases,contributions};
}

export async function financeAnalytics(db:Database,{from,to}:Filters):Promise<Analytics> {
 // Read the same accounting events that power profit and loss. No new posting or allocation rules.
 const read=async (offset:number)=>{
  const result=await db.from('finance_events' as never).select('day,revenue,direct_cost,operating_cost,depreciation')
   .gte('day',from).lte('day',to).order('day').order('order_id').order('category').order('revenue')
   .order('direct_cost').order('operating_cost').order('depreciation').range(offset,offset+499);
  if(result.error)throw Error(result.error.message);
  return (result.data??[]) as unknown as Record<string,string|number>[];
 };
 const [first,firstExpense]=await Promise.all([read(0),rows(db,'finance_expense_register',{date:'occurred_on',dates:{from,to,range:'custom'},match:{voided:false},size:500})]);
 const activity=new Map<string,{revenue:bigint;costs:bigint}>();
 const spending=new Map<string,bigint>();
 let offset=0;
 for(let batch=first;;batch=await read(offset)) {
  for(const row of batch) {
   const key=String(row.day);
   const current=activity.get(key)??{revenue:0n,costs:0n};
   current.revenue+=integers(row.revenue);
   current.costs+=integers(row.direct_cost)+integers(row.operating_cost)+integers(row.depreciation);
   activity.set(key,current);
  }
  if(batch.length<500)break;
  offset+=500;
 }
 for(let page=1;page<=Math.ceil(firstExpense.count/500);page++) {
  const batch=page===1?firstExpense:await rows(db,'finance_expense_register',{date:'occurred_on',dates:{from,to,range:'custom'},match:{voided:false},size:500,page});
  for(const row of batch.data) add(spending,String(row.category),integers(row.amount_satang));
 }
 const daily:PeriodPoint[]=[];
 const week=new Map<string,{revenue:bigint;costs:bigint}>();
 for(const cursor=new Date(from+'T00:00:00Z');cursor.getTime()<=Date.parse(to);cursor.setUTCDate(cursor.getUTCDate()+1)) {
  const key=cursor.toISOString().slice(0,10);
  const {revenue,costs}=activity.get(key)??{revenue:0n,costs:0n};
  daily.push({day:key,revenue:Number(revenue),expenses:Number(costs),profit:Number(revenue-costs)});
  const monday=new Date(cursor);
  monday.setUTCDate(monday.getUTCDate()-((monday.getUTCDay()+6)%7));
  const block=monday.toISOString().slice(0,10);
  const point=week.get(block)??{revenue:0n,costs:0n};
  week.set(block,{revenue:point.revenue+revenue,costs:point.costs+costs});
 }
 const weekly=[...week].map(([day,{revenue,costs}])=>({day,revenue:Number(revenue),expenses:Number(costs),profit:Number(revenue-costs)}));
 return {daily,weekly,spending:[...spending].map(([category,amount])=>({category,amount:Number(amount)})).sort((a,b)=>b.amount-a.amount)};
}

export type TeamSummary={id:string;name:string;points?:number;share:string;paid:string;unpaid:string;owner:boolean};
export async function financeTeam(db:Database,dates:Filters):Promise<TeamSummary[]> {
 const monthDates={...dates,from:dates.from.slice(0,7)+'-01'};
 const [agreement,first]=await Promise.all([
  db.from('finance_agreements' as never).select('id').lte('effective_on',dates.to).order('effective_on',{ascending:false}).limit(1).maybeSingle(),
  rows(db,'finance_payout_summary',{date:'month',dates:monthDates,size:500}),
 ]);
 if(agreement.error)throw Error(agreement.error.message);
 const teams=new Map<string,{name:string;points?:number;share:bigint;paid:bigint;unpaid:bigint;owner:boolean}>();
 const agreementId=(agreement.data as {id?:string}|null)?.id;
 let totalPoints=0;
 if(agreementId) {
  const {data,error}=await db.from('finance_agreement_members' as never).select('member_id,name_snapshot,basis_points').eq('agreement_id',agreementId);
  if(error)throw Error(error.message);
  for(const rate of (data??[]) as {member_id:string;name_snapshot:string;basis_points:number}[]) {
   totalPoints+=rate.basis_points;
   teams.set(rate.member_id,{name:rate.name_snapshot,points:rate.basis_points,share:0n,paid:0n,unpaid:0n,owner:false});
  }
 }
 teams.set('owner',{name:'Owner',points:agreementId?10000-totalPoints:undefined,share:0n,paid:0n,unpaid:0n,owner:true});
 for(let page=1;page<=Math.ceil(first.count/500);page++) {
  const data=page===1?first.data:(await rows(db,'finance_payout_summary',{date:'month',dates:monthDates,size:500,page})).data;
  for(const row of data) {
   const id=String(row.member_id??'owner');
   const team=teams.get(id)??{name:String(row.name_snapshot),share:0n,paid:0n,unpaid:0n,owner:false};
   team.share+=integers(row.amount_satang)+integers(row.adjustment_satang);
   team.paid+=integers(row.paid_satang);
   team.unpaid+=integers(row.remaining_satang);
   teams.set(id,team);
  }
 }
 return [...teams].map(([id,member])=>({...member,id,share:String(member.share),paid:String(member.paid),unpaid:String(member.unpaid)}));
}
