'use server';

import {createHash,randomBytes} from 'node:crypto';
import {revalidatePath} from 'next/cache';
import {serviceClient} from '@mfu/database';
import {z} from 'zod';
import {authorization} from '../data';
import {notificationLabels,type EmailAction,type EmailResult} from './types';

const emailAddress=z.email().max(254).refine(email=>!/[\s,<>]/.test(email));
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');

export async function updateEmail(action:EmailAction,form:FormData):Promise<EmailResult> {
 const admin=await authorization();
 if(!admin)return 'auth';
 const complete=(result:EmailResult)=>{revalidatePath('/finance');return result;};
 try {
  switch(action){
   case 'request': {
    const email=emailAddress.safeParse(String(form.get('email')??'').trim().toLowerCase());
    if(!email.success)return 'invalid';
    const code=randomBytes(12).toString('hex');
    const {data,error}=await serviceClient().rpc('finance_email_request' as never,
     {p_email:email.data,p_code:code,p_hash:hash(code)} as never);
    return error?'unavailable':complete(data?'queued':'rate');
   }
   case 'verify': {
    const code=String(form.get('code')??'').trim().toLowerCase();
    if(!/^[a-f0-9]{24}$/.test(code))return 'invalid';
    const {data,error}=await admin.db.rpc('finance_email_verify' as never,{p_hash:hash(code)} as never);
    return error?'unavailable':complete(data?'verified':'wrong_code');
   }
   case 'save': {
    const kinds=[...new Set(form.getAll('kind'))];
    if(kinds.some(kind=>typeof kind!=='string'||!Object.hasOwn(notificationLabels,kind)))return 'invalid';
    const {data,error}=await admin.db.rpc('finance_email_save' as never,
     {p_enabled:form.get('enabled')==='on',p_kinds:kinds} as never);
    return error?'unavailable':complete(data?'saved':'unverified');
   }
   case 'test': {
    const {data,error}=await admin.db.rpc('finance_email_test' as never);
    return error?'unavailable':complete(data?'queued':'rate');
   }
   default:return 'invalid';
  }
 } catch {return 'unavailable';}
}
