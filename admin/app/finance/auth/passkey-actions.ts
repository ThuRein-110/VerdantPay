'use server';

import {session} from '@mfu/database';
import {cookies,headers} from 'next/headers';
import {z} from 'zod';
import {financeAccess,financeSession,isApproved} from '../membership';
import {canRecover,clearRecovery,financeOrigin} from './flow';
import {recentFinanceAuthentication} from './passkey-policy';
import {financeNetwork,rateAllowed} from './rate';

type PasskeyApi=Awaited<ReturnType<typeof session>>['auth']['passkey'];
type Credential=Parameters<PasskeyApi['verifyAuthentication']>[0]['credential'];
type Mode='sign-in'|'register';
const challengeCookie='verdant-passkey';
const challengeId=z.string().min(1).max(256).regex(/^[a-zA-Z0-9_-]+$/);
const credentialShape=z.object({
 id:z.string().max(2048),rawId:z.string().max(2048),type:z.literal('public-key'),
 response:z.object({clientDataJSON:z.string().min(1).max(12000)}),
});
const unavailable={error:'unavailable'} as const;
const errorCode=(error:unknown)=>error&&typeof error==='object'&&'code' in error?error.code:null;
const providerError=(error:unknown)=>errorCode(error)==='passkey_disabled'?{error:'disabled' as const}:unavailable;

async function account() {
 const access=await financeAccess();
 if(!access?.mfa||!isApproved(access.role)||!access.user.email_confirmed_at||
    await canRecover(access.claims.session_id))return null;
 return access;
}

const cookieOptions={httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict' as const,path:'/finance'};

export async function beginPasskey(mode:Mode) {
 try {
  if(mode!=='sign-in'&&mode!=='register')return unavailable;
  if(!await rateAllowed('passkey:'+financeNetwork(await headers()),20,900))return {error:'rate' as const};
  const access=mode==='register'?await account():null;
  if(mode==='register'&&(!access||!recentFinanceAuthentication(access.claims.amr)))return {error:'reauthenticate' as const};
  if(mode==='sign-in'&&await financeSession())return {error:'signed-in' as const};
  const auth=(await session(true)).auth.passkey;
  const result=mode==='register'?await auth.startRegistration():await auth.startAuthentication();
  if(result.error||!result.data)return providerError(result.error);
  const {challenge_id:id,options}=result.data;
  const rpId='rp' in options?options.rp?.id:options.rpId;
  if(rpId!==new URL(financeOrigin()).hostname||!challengeId.safeParse(id).success)return {error:'domain' as const};
  (await cookies()).set(challengeCookie,JSON.stringify([mode,id,access?.claims.session_id??null]),{...cookieOptions,maxAge:300});
  return {options};
 }catch{return unavailable;}
}

export async function finishPasskey(mode:Mode,value:unknown) {
 try {
  if(mode!=='sign-in'&&mode!=='register')return unavailable;
  if(JSON.stringify(value)?.length>48000||!credentialShape.safeParse(value).success)return unavailable;
  const store=await cookies();
  const saved=store.get(challengeCookie)?.value;
  store.set(challengeCookie,'',{...cookieOptions,maxAge:0});
  if(!saved)return {error:'expired' as const};
  const [purpose,id,sessionId]=JSON.parse(saved);
  if(purpose!==mode||!challengeId.safeParse(id).success)return {error:'expired' as const};
  const auth=(await session(true)).auth.passkey;
  const credential=value as Credential;
  if(mode==='register'){
   const access=await account();
   if(!access||access.claims.session_id!==sessionId||!recentFinanceAuthentication(access.claims.amr))
    return {error:'reauthenticate' as const};
   const result=await auth.verifyRegistration({challengeId:id,credential});
   return result.error||!result.data?providerError(result.error):{ok:true as const};
  }
  if(sessionId!==null||await financeSession())return {error:'signed-in' as const};
  const result=await auth.verifyAuthentication({challengeId:id,credential});
  if(result.error||!result.data?.session)return providerError(result.error);
  await clearRecovery();
  return {ok:true as const};
 }catch{return unavailable;}
}

export async function listFinancePasskeys() {
 try {
  if(!await account())return {error:'reauthenticate' as const};
  const result=await (await session(true)).auth.passkey.list();
  if(result.error||!result.data)return providerError(result.error);
  return {items:result.data.map(({id,friendly_name,created_at,last_used_at})=>({id,friendly_name,created_at,last_used_at})),
   recent:recentFinanceAuthentication((await financeAccess())?.claims.amr)};
 }catch{return unavailable;}
}

export async function changeFinancePasskey(operation:'rename'|'remove',id:string,label?:string) {
 try {
  if((operation!=='rename'&&operation!=='remove')||!z.uuid().safeParse(id).success)return unavailable;
  const access=await account();
  if(!access||!recentFinanceAuthentication(access.claims.amr))return {error:'reauthenticate' as const};
  const auth=(await session(true)).auth.passkey;
  if(operation==='remove'){
   const result=await auth.delete({passkeyId:id});
   return result.error?providerError(result.error):{ok:true as const};
  }
  const parsed=z.string().trim().min(1).max(120).safeParse(label);
  if(!parsed.success)return {error:'name' as const};
  const result=await auth.update({passkeyId:id,friendlyName:parsed.data});
  return result.error?providerError(result.error):{ok:true as const};
 }catch{return unavailable;}
}
