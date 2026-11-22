'use client';

import {useEffect,useRef} from 'react';
import {ArcElement,BarController,BarElement,CategoryScale,Chart,DoughnutController,Legend,LinearScale,LineController,LineElement,PointElement,Tooltip,Filler} from 'chart.js';
import type {Stats} from './data';
import type {Analytics} from './analytics';
import {thb} from './model';

Chart.register(ArcElement,BarController,BarElement,CategoryScale,DoughnutController,Legend,LinearScale,LineController,LineElement,PointElement,Tooltip,Filler);
type Series={label:string;values:(number|null)[];color:string};
const teal='#079463',blue='#3d9e87',purple='#6b9185',orange='#8a9c94';
const categoryColors=['#079463','#4773ab','#ce893b','#8b719d','#71aa94'];
function Graph({title,labels,series,type='line',unit='THB',empty,thai=false}:{title:string;labels:string[];series:Series[];type?:'line'|'bar'|'doughnut';unit?:string;empty:string;thai?:boolean}) {
 const canvas=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  if(!canvas.current||!labels.length)return;
  const text=getComputedStyle(canvas.current).getPropertyValue('--fin-muted').trim();
  const line=getComputedStyle(canvas.current).getPropertyValue('--fin-line').trim();
  const ring=type==='doughnut';
  const chart=new Chart(canvas.current,{type,data:{labels,datasets:series.map(s=>({label:s.label,data:s.values,borderColor:s.color,
   backgroundColor:ring?labels.map((_,index)=>categoryColors[index%categoryColors.length]):type==='bar'?s.color:s.color+'22',
   fill:type==='line'&&series.length===1,pointRadius:labels.length<12?3:0,pointHoverRadius:5,borderWidth:ring?0:2,maxBarThickness:40,borderRadius:5,tension:0.25}))},
   options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:ring?'nearest':'index',intersect:ring},
    plugins:{legend:{display:ring||series.length>1,position:ring?'bottom':'top',labels:{color:text,usePointStyle:true,boxWidth:8}},
    tooltip:{callbacks:{label:context=>{
     const parsed=context.parsed as number|{y?:number|null};
     const value=typeof parsed==='number'?parsed:parsed.y??0;
     return (ring?context.label:context.dataset.label)+' · '+(unit==='THB'?thb(Math.round(value*100),thai?'th':'en'):value.toLocaleString()+' '+unit);
    }}}},
    scales:ring?undefined:{x:{offset:labels.length===1||type==='bar',ticks:{color:text,maxTicksLimit:6,maxRotation:0,autoSkip:true},grid:{display:false}},y:{ticks:{color:text,maxTicksLimit:5},grid:{color:line}}}}});
  const observer=new MutationObserver(()=>{if(!canvas.current)return;const style=getComputedStyle(canvas.current);const color=style.getPropertyValue('--fin-muted').trim();const grid=style.getPropertyValue('--fin-line').trim();
   for(const scale of Object.values(chart.options.scales??{})) {if(scale?.ticks)scale.ticks.color=color;if(scale?.grid)scale.grid.color=grid;}
   if(chart.options.plugins?.legend?.labels)chart.options.plugins.legend.labels.color=color;
   chart.update('none');
  });
  observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','style']});
  return ()=>{observer.disconnect();chart.destroy();};
 },[labels,series,type,unit,thai]);
 return <article className="finance-panel finance-graph"><h2>{title}</h2>
  {labels.length?<><div className="finance-chart"><canvas ref={canvas} role="img" aria-label={title}/></div><details className="finance-chart-data"><summary>{thai?'ข้อมูลกราฟ':'Chart data'}</summary><table><tbody>{labels.map((label,index)=><tr key={label}><th>{label}</th>{series.map(s=><td key={s.label}>{s.label} {s.values[index]?.toLocaleString()??'—'}</td>)}</tr>)}</tbody></table></details></>:<div className="finance-graph-empty">{empty}</div>}</article>;
}
export function AnalyticsCharts({data,analytics,range,thai}:{data:Stats;analytics:Analytics;range:string;thai:boolean}) {
 const l=(a:string,b:string)=>thai?b:a;
 const empty=l('No activity in this period','ไม่มีรายการในช่วงนี้');
 const months=range==='year'||analytics.daily.length>62;
 const small=!months&&(range==='week'||range==='today'||(range==='custom'&&analytics.daily.length<=14));
 const points=small?analytics.daily:months?data.monthly.map(item=>({day:item.day,revenue:item.revenue,expenses:item.costs,profit:item.profit})):analytics.weekly;
 const labels=points.map(item=>months?item.day.slice(0,7):item.day.slice(5));
 const spending=analytics.spending.slice(0,10);
 return <div className="finance-graphs">
  <Graph thai={thai} type="bar" title={l('Income vs expenses','รายรับเทียบค่าใช้จ่าย')} labels={labels} empty={empty} series={[
   {label:l('Income','รายรับ'),values:points.map(item=>item.revenue/100),color:teal},
   {label:l('Expenses','ค่าใช้จ่าย'),values:points.map(item=>item.expenses/100),color:orange}]}/>
  <Graph thai={thai} type="doughnut" title={l('Booked spending by category','ค่าใช้จ่ายที่บันทึกตามหมวดหมู่')} labels={spending.map(item=>item.category)} empty={empty}
   series={[{label:l('Booked expenses','ค่าใช้จ่ายที่บันทึก'),values:spending.map(item=>item.amount/100),color:blue}]}/>
  <Graph thai={thai} title={months?l('Monthly net profit','กำไรสุทธิรายเดือน'):small?l('Daily net profit','กำไรสุทธิรายวัน'):l('Weekly net profit','กำไรสุทธิรายสัปดาห์')} labels={labels} empty={empty}
   series={[{label:l('Net profit','กำไรสุทธิ'),values:points.map(item=>item.profit/100),color:teal}]}/>
  <Graph thai={thai} title={l('Monthly profit margin','อัตรากำไรรายเดือน')} labels={data.monthly.map(item=>item.day.slice(0,7))} empty={empty} unit="%"
   series={[{label:l('Net margin','อัตรากำไรสุทธิ'),values:data.monthly.map(item=>item.margin),color:purple}]}/>
 </div>;
}
export function Graphs({data,thai,profitOnly=false}:{data:Stats;thai:boolean;profitOnly?:boolean}) {
 const l=(a:string,b:string)=>thai?b:a;
 const empty=l('No activity in this period','ไม่มีรายการในช่วงนี้');
 const monthly=data.monthly.map(item=>item.day.slice(0,7));
 const revenue=l('Revenue','รายได้'),expense=l('Expenses','ค่าใช้จ่าย'),profit=l('Net profit','กำไรสุทธิ');
 return <div className="finance-graphs">
  <Graph thai={thai} title={l('Monthly performance','ผลประกอบการรายเดือน')} labels={monthly} empty={empty} type={monthly.length===1?'bar':'line'} series={[
   {label:revenue,values:data.monthly.map(item=>item.revenue/100),color:teal},
   {label:expense,values:data.monthly.map(item=>item.costs/100),color:orange},
   {label:profit,values:data.monthly.map(item=>item.profit/100),color:blue}]}/>
  <Graph title={l('Profit margin','อัตรากำไร')} labels={monthly} empty={empty} unit="%" series={[{label:l('Net margin','อัตรากำไรสุทธิ'),values:data.monthly.map(item=>item.margin),color:purple}]}/>
  {!profitOnly&&<>
   <Graph title={l('Daily revenue','รายได้รายวัน')} labels={data.daily.map(item=>item.day.slice(5))} empty={empty} type="bar" series={[{label:revenue,values:data.daily.map(item=>item.revenue/100),color:teal}]}/>
   <Graph title={l('Sales by service','ยอดขายตามบริการ')} labels={data.categories.map(item=>item.category)} empty={empty} type="bar" series={[{label:revenue,values:data.categories.map(item=>item.revenue/100),color:blue}]}/>
   <Graph title={l('Material consumption','ปริมาณวัสดุที่ใช้')} labels={data.consumption.map(item=>item.day.slice(0,7))} empty={empty} unit="g" series={[{label:l('Filament','เส้นพิมพ์'),values:data.consumption.map(item=>item.grams),color:purple}]}/>
  </>}
 </div>;
}
