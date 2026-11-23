import 'server-only';
import {serviceClient} from '@mfu/database';
import {createHmac} from 'node:crypto';

export function financeNetwork(headers:Pick<Headers,'get'>) {
 return (headers.get('cf-connecting-ip')??headers.get('x-vercel-forwarded-for')??'unknown').split(',')[0].trim();
}

export async function rateAllowed(key:string,limit:number,seconds:number) {
 const digest=createHmac('sha256',process.env.SUPABASE_SERVICE_ROLE_KEY!).update(key).digest('hex');
 const {data,error}=await serviceClient().rpc('take_rate_limit',{p_key:'finance:'+digest,p_limit:limit,p_seconds:seconds});
 if(error)throw Error('Rate limit unavailable');
 return data===true;
}
