import {financeAdmin,overview} from '../data';
import {period,thb} from '../model';
import {PrintButton} from './print-button';
import '../finance.css';
export const dynamic='force-dynamic';
export const metadata={title:'Printable finance report',robots:{index:false,follow:false}};
export default async function PrintPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
 const [db,query]=await Promise.all([financeAdmin(),searchParams]);
 const dates=period(query);
 const result=await overview(db,dates);
 const title=query.report==='yearly'?'Yearly business summary':'Profit and loss';
 return <article className="finance-print"><h1>{title}</h1><p>3D Printing MFU By Memo · {dates.from} – {dates.to}</p><PrintButton/>
  <table><thead><tr><th>Month</th><th>Revenue</th><th>Costs and depreciation</th><th>Net profit</th></tr></thead>
   <tbody>{result.monthly.map(month=><tr key={month.day}><td>{month.day.slice(0,7)}</td><td>{thb(month.revenue)}</td><td>{thb(month.costs)}</td><td>{thb(month.profit)}</td></tr>)}</tbody>
   <tfoot><tr><th>Total</th><td>{thb(result.revenue)}</td><td>{thb(result.directCost+result.operating+result.depreciation)}</td><td>{thb(result.net)}</td></tr></tfoot></table></article>;
}
