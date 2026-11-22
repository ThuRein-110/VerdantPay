import 'server-only';
import {cache} from 'react';
import {redirect} from 'next/navigation';
import type {Filters} from './model';
import {financeAccess,financeDestination} from './membership';

export const authorization = cache(async () => {
 const access=await financeAccess();
 return access?.mfa&&(access.role==='owner'||access.role==='admin')?access:null;
});
export async function financeAdmin() {
 const result = await authorization();
 if(!result) redirect(financeDestination(await financeAccess()));
 return result.db;
}
export type Row = Record<string, string | number | boolean | null>;
export type Stats = Record<string, number> & {
 monthly: {day:string; revenue:number; costs:number; profit:number; margin:number|null}[];
 daily: {day:string; revenue:number}[];
 categories: {category:string; revenue:number}[];
 consumption: {day:string; grams:number}[];
 accounts: {name:string; balance:number}[];
};
type Database = Awaited<ReturnType<typeof financeAdmin>>;
export async function overview(db:Database, {from,to}:Filters) {
 const result = await db.rpc('finance_overview' as never,{p_from:from,p_to:to} as never);
 if (result.error) throw Error(result.error.message);
 return result.data as unknown as Stats;
}
type Options = {date?:string; dates?:Filters; sort?:string; ascending?:boolean; search?:string; query?:string; match?:Record<string,string|boolean>; page?:number; size?:number};
export async function rows(db:Database, relation:string, options:Options={}) {
 const {date,dates,sort=date??'id',ascending=false,search,query,match,page=1,size=25}=options;
 // The runtime table names come from server-owned report and section definitions.
 let request=db.from(relation as never).select('*',{count:'exact'});
 if (date && dates) request=request.gte(date,dates.from).lte(date,dates.to);
 if (search && query) request=request.ilike(search,'%'+query.replace(/[\\%_*]/g,char=>'\\'+char)+'%');
 for(const [column,value] of Object.entries(match??{})) request=request.eq(column,value);
 const {data,error,count} = await request.order(sort,{ascending}).order('id',{ascending:true}).range((page-1)*size,page*size-1);
 if(error) throw Error(error.message);
 return {data:(data??[]) as unknown as Row[], count:count??0};
}
