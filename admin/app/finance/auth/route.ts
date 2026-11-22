import {session} from '@mfu/database';
import {csrf} from '@mfu/database/csrf.ts';
import {readLimited} from '@mfu/database/limits.ts';
import {customerRate} from '@mfu/database/customer-security.ts';
import {financeAccess,financeDestination,isApproved} from '../membership';
import {authInput} from './input';
import {canRecover,clearRecovery,financeCallback,rememberFinanceFlow} from './flow';

function reply(data:Record<string,unknown>,status=200) {
 return Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
}
const fail=(error:string,status=400)=>reply({error},status);
const go=(destination:string)=>reply({destination});

export async function POST(request:Request) {
 try {csrf(request,true);}catch{return fail('origin',403);}
 let payload:unknown;
 try {payload=JSON.parse(new TextDecoder().decode(await readLimited(request,8192)));}catch{return fail('invalid');}
 const input=authInput.safeParse(payload);
 if(!input.success)return fail(String(input.error.issues[0]?.path[0]||'invalid'));
 const p=input.data;
 try {
  if(p.action!=='logout'){
   const network=(request.headers.get('x-vercel-forwarded-for')??'unknown').split(',')[0].trim();
   try {
    await customerRate(request,'finance-network:'+network,30,900);
    if('email' in p&&['signup','forgot'].includes(p.action))
     await customerRate(request,'finance-mail:'+p.email,4,3600);
   } catch {return fail('rate',429);}
  }
  const db=await session();
  if(p.action==='logout'){
   const {error}=await db.auth.signOut({scope:'local'});
   if(error&&error.name!=='AuthSessionMissingError')return fail('unavailable',503);
   await clearRecovery();
   return go('/finance/login');
  }
  if(p.action==='signup'){
   const {data,error}=await db.auth.signUp({email:p.email,password:p.password,options:{
    data:{full_name:p.name},emailRedirectTo:financeCallback(),
   }});
   if(error?.code==='weak_password')return fail('password');
   if(error?.code==='signup_disabled')return fail('unavailable',503);
   await rememberFinanceFlow('signup');
   if(data.session)await db.rpc('finance_request_access' as never,{p_name:p.name} as never);
   return go('/finance/verify');
  }
  if(p.action==='forgot'){
   await db.auth.resetPasswordForEmail(p.email,{redirectTo:financeCallback()});
   await rememberFinanceFlow('recovery');
   return reply({message:'email_sent'});
  }
  if(p.action==='login'){
   const {error}=await db.auth.signInWithPassword({email:p.email,password:p.password});
   if(error)return fail('login',401);
   await clearRecovery();
   const access=await financeAccess();
   if(!access)return fail('unavailable',503);
   if(access.role==='unassigned'){
    const name=access.user.user_metadata.full_name;
    const {error:joinError}=await db.rpc('finance_request_access' as never,
     {p_name:typeof name==='string'?name.slice(0,120):null} as never);
    if(joinError)return fail('unavailable',503);
   }
   return go(financeDestination(access));
  }

  const access=await financeAccess();
  if(!access)return fail('session',401);
  if(p.action==='reset'){
   if(!await canRecover(access.claims.session_id))return fail('recovery',403);
   const {error}=await db.auth.updateUser({password:p.password});
   if(error)return fail(error.code==='weak_password'?'password':error.code==='same_password'?'same_password':'unavailable');
   await clearRecovery();
   const revoked=await db.auth.signOut({scope:'global'});
   if(revoked.error&&revoked.error.name!=='AuthSessionMissingError')await db.auth.signOut({scope:'local'});
   return go('/finance/login?reset=1');
  }
  if(p.action==='request'){
   const {error}=await db.rpc('finance_request_access' as never,{p_name:null} as never);
   if(error)return fail('unavailable',503);
   return go(financeDestination(access));
  }
  if(!isApproved(access.role))return fail('approval',403);
  if(p.action==='mfa'){
   if(access.mfa)return go(financeDestination(access));
   const factors=await db.auth.mfa.listFactors();
   if(factors.error)return fail('unavailable',503);
   const verified=factors.data.totp.find(factor=>factor.status==='verified');
   if(verified)return reply({factor:verified.id});
   const stale=factors.data.all.find(factor=>factor.factor_type==='totp'&&factor.friendly_name==='Memo Finance'&&factor.status==='unverified');
   if(stale){
    const removal=await db.auth.mfa.unenroll({factorId:stale.id});
    if(removal.error)return fail('unavailable',503);
   }
   const enrollment=await db.auth.mfa.enroll({factorType:'totp',friendlyName:'Memo Finance'});
   if(enrollment.error)return fail('unavailable',503);
   return reply({factor:enrollment.data.id,secret:enrollment.data.totp.secret});
  }
  if(p.action==='verify-mfa'){
   const verification=await db.auth.mfa.challengeAndVerify({factorId:p.factor,code:p.code});
   if(verification.error)return fail('mfa');
   return go(access.role==='team'?'/finance/team-access':'/finance');
  }
  return fail('invalid');
 } catch {return fail('unavailable',503);}
}
