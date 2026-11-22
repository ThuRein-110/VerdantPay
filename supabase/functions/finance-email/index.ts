import {sendEmail,titles,type EmailJob} from './email.ts';

function reply(status:number,body:Record<string,unknown>) {
 return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
}
async function authorized(header:string|null,secret:string|undefined) {
 if(!secret||secret.length<32||!header||header.length>512)return false;
 const encoder=new TextEncoder();
 const [expected,received]=await Promise.all([
  crypto.subtle.digest('SHA-256',encoder.encode('Bearer '+secret)),
  crypto.subtle.digest('SHA-256',encoder.encode(header)),
 ]);
 let mismatch=0;
 const a=new Uint8Array(expected),b=new Uint8Array(received);
 for(let i=0;i<a.length;i++)mismatch|=a[i]^b[i];
 return mismatch===0;
}
function appLink(value:string|undefined) {
 if(!value)return undefined;
 try {
  const url=new URL(value);
  if(url.protocol==='https:'&&!url.username&&!url.password)return new URL('/finance',url).href;
 } catch { /* The email remains usable without a link. */ }
}
Deno.serve(async request=>{
 if(request.method!=='POST')return reply(405,{error:'method'});
 const env=(key:string)=>Deno.env.get(key);
 if(!await authorized(request.headers.get('authorization'),env('MEMO_EMAIL_SCHEDULER_TOKEN')))return reply(401,{error:'unauthorized'});
 const apiKey=env('MEMO_RESEND_API_KEY'),from=env('MEMO_EMAIL_FROM');
 const recipient=env('MEMO_APPROVED_RECIPIENT')?.trim().toLowerCase();
 const url=env('SUPABASE_URL'),key=env('SUPABASE_SERVICE_ROLE_KEY');
 if(env('MEMO_EMAIL_ENABLED')!=='true'||!apiKey||!from||!url||!key||!recipient||
  !/^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(recipient))return reply(503,{error:'delivery_disabled'});
 const rpc=async(name:string,params:Record<string,unknown>)=>{
  const response=await fetch(url+'/rest/v1/rpc/'+name,{
   method:'POST',signal:AbortSignal.timeout(5000),
   headers:{Authorization:'Bearer '+key,apikey:key,'Content-Type':'application/json'},body:JSON.stringify(params),
  });
  if(!response.ok)throw Error('Ledger request failed');
  return response.json();
 };
 const config={apiKey,from,appUrl:appLink(env('MEMO_APP_URL'))};
 let processed=0;
 try {
  for(let i=0;i<5;i++){
   const job=await rpc('finance_email_claim',{p_recipient:recipient}) as EmailJob|null;
   if(!job)break;
   let result;
   try {
    result=job.recipient===recipient&&Object.hasOwn(titles,job.kind)?await sendEmail(job,config):{outcome:'provider_rejected'} as const;
   } catch {result={outcome:'provider_rejected'} as const;}
   await rpc('finance_email_finish',{p_id:job.id,p_lease:job.lease,p_outcome:result.outcome,
    p_provider_id:'providerId' in result?result.providerId??null:null,p_delay:'delay' in result?result.delay??0:0,
    p_pause:'pause' in result?result.pause??null:null});
   processed++;
   if(result.outcome==='daily_quota'||result.outcome==='monthly_quota'||('pause' in result&&result.pause))break;
   if(i<4)await new Promise(resolve=>setTimeout(resolve,550));
  }
  return reply(200,{processed});
 } catch {
  console.error('Memo Finance email worker ledger call failed');
  return reply(502,{error:'ledger_unavailable',processed});
 }
});
