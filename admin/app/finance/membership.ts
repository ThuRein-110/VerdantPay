import 'server-only';
import {cache} from 'react';
import {requireUser} from '@mfu/database';

const roles=['owner','admin','team','pending','unassigned','revoked'] as const;
export type FinanceRole=typeof roles[number];

export const financeSession=cache(async()=>{
 try { return await requireUser(true); } catch { return null; }
});

export const financeAccess=cache(async()=>{
 const context=await financeSession();
 if(!context)return null;
 const {data,error}=await context.db.rpc('finance_access_role' as never);
 if(error||!roles.includes(data as FinanceRole))throw Error('Finance authorization unavailable');
 return {...context,role:data as FinanceRole,mfa:context.claims.aal==='aal2'};
});

export const isApproved=(role:FinanceRole)=>role==='owner'||role==='admin'||role==='team';

export function financeDestination(access:Awaited<ReturnType<typeof financeAccess>>) {
 if(!access)return '/finance/login';
 if(!isApproved(access.role))return '/finance/pending';
 if(!access.mfa)return '/finance/login';
 return access.role==='team'?'/finance/team-access':'/finance';
}

export async function financeOwner() {
 const access=await financeAccess();
 return access?.role==='owner'&&access.mfa?access:null;
}
