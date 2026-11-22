import 'server-only';
import {rows, type financeAdmin} from './data';
import {baht} from './model';
import type {Lookups} from './forms';

const relations={accounts:'finance_accounts',sales:'finance_categories',expenses:'finance_categories',orders:'finance_order_summary',
 spools:'finance_stock',assets:'finance_assets',members:'finance_members',recurring:'finance_recurring'} as const;
export async function financeLookups(db:Awaited<ReturnType<typeof financeAdmin>>, keys:(keyof Lookups)[]):Promise<Lookups> {
 const entries=await Promise.all(keys.map(async key=>{
  const byName=key!=='orders'&&key!=='spools';
  const result=await rows(db,relations[key],{size:1000,sort:byName?'name':key==='orders'?'booked_on':'purchased_on',ascending:byName,
   match:key==='sales'?{kind:'sale'}:key==='expenses'?{kind:'expense'}:key==='recurring'?{enabled:true}:undefined});
  return [key,result.data.map(row=>({
   value:String(row.id),
   label:key==='spools'?[row.material,row.color,row.brand,row.purchased_on,String(row.remaining_grams)+' g'].filter(Boolean).join(' · '):
    key==='orders'?row.reference+' · '+row.customer:String(row.name),
   price:key==='sales'?baht(row.default_satang):undefined,
  }))] as const;
 }));
 return {accounts:[],sales:[],expenses:[],orders:[],spools:[],assets:[],members:[],recurring:[],...Object.fromEntries(entries)};
}
