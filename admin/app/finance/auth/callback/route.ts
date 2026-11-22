import {NextResponse} from 'next/server';
import {session} from '@mfu/database';
import {clearRecovery,financeOrigin,grantRecovery,takeFinanceFlow} from '../flow';

export async function GET(request:Request) {
 const target=(page:string)=>{
  const response=NextResponse.redirect(new URL(page,financeOrigin()),303);
  response.headers.set('Cache-Control','private, no-store');
  response.headers.set('Referrer-Policy','no-referrer');
  return response;
 };
 const url=new URL(request.url);
 const code=url.searchParams.get('code');
 if(!code||code.length>1024)return target('/finance/verify?result=expired');
 try {
  const purpose=await takeFinanceFlow();
  if(!purpose)return target('/finance/verify?result=expired');
  const db=await session();
  const {data,error}=await db.auth.exchangeCodeForSession(code);
  if(error||!data.session)return target('/finance/verify?result=expired');
  if(purpose==='recovery'){
   const {data:claims}=await db.auth.getClaims();
   const id=claims?.claims.session_id;
   if(typeof id!=='string'){
    await db.auth.signOut({scope:'local'});
    return target('/finance/verify?result=expired');
   }
   await grantRecovery(id);
   return target('/finance/reset-password');
  }
  await clearRecovery();
  const name=data.user?.user_metadata.full_name;
  const {error:accessError}=await db.rpc('finance_request_access' as never,
   {p_name:typeof name==='string'?name.slice(0,120):null} as never);
  return target('/finance/verify?result='+(accessError?'review':'confirmed'));
 }catch{return target('/finance/verify?result=expired');}
}
