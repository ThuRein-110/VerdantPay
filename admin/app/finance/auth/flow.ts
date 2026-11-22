import 'server-only';
import {cookies} from 'next/headers';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {backendConfig} from '@mfu/database/server.ts';
import {customerOrigin} from '@mfu/database/customer-auth-policy.ts';

const flowCookie='memo-finance-pkce';
const recoveryCookie='memo-finance-recovery';
export const financeOrigin=()=>customerOrigin(process.env.ADMIN_ORIGIN||process.env.APP_ORIGIN);
export const financeCallback=()=>financeOrigin()+'/finance/auth/callback';
const authCookie=(seconds:number)=>({
 httpOnly:true,secure:financeOrigin().startsWith('https:'),sameSite:'lax' as const,path:'/finance',maxAge:seconds,
});
const mac=(value:string)=>createHmac('sha256',process.env.SUPABASE_SERVICE_ROLE_KEY!).update(value).digest('hex');
const equal=(a:string,b:string)=>a.length===b.length&&timingSafeEqual(Buffer.from(a,'utf8'),Buffer.from(b,'utf8'));
function seal(value:string,purpose:string,expires:number) {
 return expires+'.'+mac(purpose+':'+expires+':'+value);
}
function valid(token:string|undefined,value:string,purpose:string) {
 const parts=token?.split('.')??[];
 const expires=Number(parts[0]);
 return parts.length===2&&/^[0-9]{13}$/.test(parts[0])&&expires>Date.now()&&/^[a-f0-9]{64}$/.test(parts[1])&&
  equal(seal(value,purpose,expires),token!);
}
async function verifier() {
 const host=new URL(backendConfig().url!).hostname.split('.')[0];
 const name='sb-'+host+'-auth-token-code-verifier';
 return (await cookies()).getAll().filter(cookie=>cookie.name===name||cookie.name.startsWith(name+'.'))
  .sort((a,b)=>a.name.localeCompare(b.name)).map(cookie=>cookie.name+'='+cookie.value).join(';');
}

export async function rememberFinanceFlow(purpose:'signup'|'recovery') {
 const material=await verifier();
 if(!material)return;
 const expires=Date.now()+900000;
 (await cookies()).set(flowCookie,purpose+':'+seal(material,'finance-'+purpose,expires),authCookie(900));
}
export async function takeFinanceFlow() {
 const store=await cookies();
 const [purpose,token]=store.get(flowCookie)?.value.split(':')??[];
 if(purpose!=='signup'&&purpose!=='recovery')return null;
 const material=await verifier();
 if(!material||!valid(token,material,'finance-'+purpose))return null;
 store.set(flowCookie,'',authCookie(0));
 return purpose;
}
export async function grantRecovery(sessionId:string) {
 (await cookies()).set(recoveryCookie,seal(sessionId,'finance-reset',Date.now()+600000),authCookie(600));
}
export async function canRecover(sessionId:unknown) {
 if(typeof sessionId!=='string')return false;
 return valid((await cookies()).get(recoveryCookie)?.value,sessionId,'finance-reset');
}
export async function clearRecovery() {
 (await cookies()).set(recoveryCookie,'',authCookie(0));
}
