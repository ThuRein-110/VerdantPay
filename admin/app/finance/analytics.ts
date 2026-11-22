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
