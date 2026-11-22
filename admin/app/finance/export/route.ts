import {authorization,overview,rows} from '../data';
import {period} from '../model';
import {csv,excel,type Sheet} from '../export-files';
import {reports,reportTables,type Report} from '../reports';

export const dynamic='force-dynamic';
export const runtime='nodejs';
const privateHeaders={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'};
const dateHead={label:'Date'};
const revenue={label:'Recognized revenue',money:true};
const costs={label:'Expenses and depreciation',money:true};
const profit={label:'Net profit before team shares',money:true};
const summary=[
 ['invoiced','Invoiced sales'],['revenue','Recognized revenue'],['received','Cash received net'],
 ['directCost','Direct costs'],['gross','Gross profit'],['operating','Operating expenses'],['depreciation','Depreciation'],
 ['net','Net profit before team shares'],['team','Team shares accrued'],['teamPaid','Team payments'],
 ['ownerAllocation','Owner allocation'],['ownerRemaining','Owner profit after team shares'],
 ['cash','Current cash balance'],['receivable','Current receivables'],['payable','Current supplier payables'],
 ['stock','Current inventory value'],['investment','Current business investment'],['assets','Current asset value'],
] as const;

export async function GET(request:Request) {
 const context=await authorization();
 if(!context)return new Response('Administrator sign-in required',{status:401,headers:privateHeaders});
 const {searchParams}=new URL(request.url);
 const report=searchParams.get('report')??'';
 const format=searchParams.get('format');
 if(!Object.hasOwn(reports,report)||(format!=='xlsx'&&format!=='csv'))return new Response('Unknown report or format',{status:400,headers:privateHeaders});
 const dates=period(Object.fromEntries(searchParams));
 try {
  let sheets:Sheet[];
  if(report in reportTables) {
   const definitions=reportTables[report as keyof typeof reportTables];
   sheets=await Promise.all(definitions.map(async table=>{
    const filter={date:table.date,dates,size:500,ascending:true};
    const first=await rows(context.db,table.relation,filter);
    if(first.count>5000)throw new RangeError('Choose a shorter date range to export 5,000 rows or fewer.');
    const records=[...first.data];
    for(let page=2;page<=Math.ceil(first.count/500);page++)records.push(...(await rows(context.db,table.relation,{...filter,page})).data);
    return {name:table.title[0],columns:table.columns.map(([,title,type])=>({label:title[0],money:type==='money'})),
     rows:records.map(row=>table.columns.map(([key,,type])=>{
      if(key==='payout_state')return row.member_id?(Number(row.remaining_satang)===0?'Paid':Number(row.paid_satang)>0?'Partial':'Pending'):'Owner';
      const value=row[key]??null;
      if(key==='satang_per_gram'&&value!==null)return Number(value)/100;
      return type==='money'&&value!==null?Number(value):value;
     }))};
   }));
  } else {
   const data=await overview(context.db,dates);
   if(report==='daily')sheets=[{name:'Daily sales',columns:[dateHead,revenue],rows:data.daily.map(row=>[row.day,row.revenue])}];
   else if(report==='monthly')sheets=[{name:'Monthly sales',columns:[dateHead,revenue],rows:data.monthly.map(row=>[row.day,row.revenue])}];
   else {
    sheets=[{name:reports[report as Report][0],columns:[dateHead,revenue,costs,profit,{label:'Net margin (%)'}],
     rows:data.monthly.map(row=>[row.day,row.revenue,row.costs,row.profit,row.margin])},
     {name:'Period totals',columns:[{label:'Metric'},{label:'Value',money:true}],rows:summary.map(([key,label])=>[label,data[key]])}];
   }
  }
  const filename='memo-'+report+'-'+dates.from+'_'+dates.to+'.'+format;
  return new Response(format==='csv'?'\ufeff'+csv(sheets):await excel(sheets),{headers:{...privateHeaders,
   'Content-Type':format==='csv'?'text/csv; charset=utf-8':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
   'Content-Disposition':'attachment; filename="'+filename+'"'}});
 } catch(error) {
  if(error instanceof RangeError)return new Response(error.message,{status:422,headers:privateHeaders});
  return new Response('Report unavailable',{status:500,headers:privateHeaders});
 }
}
