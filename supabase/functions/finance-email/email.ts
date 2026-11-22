export const titles = {
 verify:'Verify your notification email',test:'Notification test',income:'Income received',expense:'Expense recorded',
 investment:'Investment recorded',payout:'Team payout recorded',daily:'Daily finance summary',weekly:'Weekly finance summary',
 monthly:'Monthly profit report',yearly:'Yearly profit report',
} as const;
export type EmailKind = keyof typeof titles;
export type EmailJob = {id:string;lease:string;kind:EmailKind;recipient:string;payload:Record<string,unknown>};
export type SendResult = {outcome:'sent'|'retry'|'provider_rejected'|'daily_quota'|'monthly_quota';providerId?:string;delay?:number;pause?:'daily_quota'|'monthly_quota'};

const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
const integers=new Intl.NumberFormat('en-TH');
const dateFormat=new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeZone:'Asia/Bangkok'});
export function thb(value:unknown) {
 const amount=BigInt(String(value));
 const absolute=amount<0n?-amount:amount;
 return `${amount<0n?'−':''}฿${integers.format(absolute/100n)}.${String(absolute%100n).padStart(2,'0')}`;
}
function date(value:unknown) {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('Invalid ledger date');
 return dateFormat.format(new Date(value+'T00:00:00+07:00'));
}
export function renderEmail(kind:EmailKind,payload:Record<string,unknown>,appUrl?:string) {
 const title=titles[kind];
 const subject='Memo Finance · '+title;
 const lines:[string,string][]=[];
 let intro:string;
 if(kind==='verify'){
  if(typeof payload.code!=='string'||!/^[0-9a-f]{24}$/.test(payload.code))throw Error('Invalid verification code');
  intro='Paste this code into Email Notifications in Memo Finance. The code expires 45 minutes after it was requested.';
  lines.push(['Verification code',payload.code]);
 }else if(kind==='test'){
  intro='Memo Finance can reach this verified address. This test contains no financial information.';
 }else if('amount' in payload){
  intro='A financial record was committed in Memo Finance.';
  lines.push(['Record date',date(payload.day)],['Amount',thb(payload.amount)]);
 }else{
  intro=`Reporting period ${date(payload.from)} – ${date(payload.through)} · Asia/Bangkok.`;
  lines.push(['Recognized income',thb(payload.income)],['Expenses and depreciation',thb(payload.expenses)],['Profit before allocation',thb(payload.profit)]);
  if(kind==='monthly'){
   const recorded=payload.allocation_status==='recorded';
   intro+=' '+(recorded?'Shares reflect the recorded monthly close.':'Shares are estimates using the saved agreement. Close the month to post allocations.');
   for(const item of Array.isArray(payload.shares)?payload.shares:[]){
    lines.push([item.owner?'Owner allocation':String(item.name),thb(item.amount)]);
   }
  }
 }
 const rows=lines.map(([label,value])=>`<tr><td style="padding:12px 8px;font-size:14px;color:#36594c;border-bottom:1px solid #dcebe4;overflow-wrap:anywhere">${escapeHtml(label)}</td><td align="right" style="padding:12px 8px;color:#123d2e;border-bottom:1px solid #dcebe4;overflow-wrap:anywhere;font-weight:700">${escapeHtml(value)}</td></tr>`).join('');
 const link=appUrl?`<p style="margin:24px 0 2px"><a href="${escapeHtml(appUrl)}" style="display:inline-block;padding:12px 18px;border-radius:9px;color:#fff;background:#067551;font-weight:700;text-decoration:none">Open Memo Finance</a></p>`:'';
 const html=`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width, initial-scale=1"><body style="margin:0;background:#edf5f0;color:#123d2e;font:16px/1.5 Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" style="background:#edf5f0"><tr><td align="center" style="padding:20px 10px"><table role="presentation" width="100%" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden"><tr><td style="padding:20px 24px;background:#075b42;color:#fff;font-size:19px;font-weight:700">Memo Finance</td></tr><tr><td style="padding:22px 24px"><h1 style="font-size:23px;margin:0 0 10px">${escapeHtml(title)}</h1><p style="margin:0 0 14px;color:#36594c">${escapeHtml(intro)}</p><table width="100%" cellspacing="0">${rows}</table>${link}</td></tr><tr><td style="padding:14px 24px;background:#f5faf7;color:#36594c;font-size:12px">Manage these messages in Memo Finance Settings.</td></tr></table></td></tr></table></body></html>`;
 const text=[title,intro,...lines.map(([label,value])=>label+': '+value),appUrl??'','Manage these messages in Memo Finance Settings.'].filter(Boolean).join('\n\n');
 return {subject,html,text};
}

export async function sendEmail(job:EmailJob,config:{apiKey:string;from:string;appUrl?:string},request=fetch):Promise<SendResult> {
 const content=renderEmail(job.kind,job.payload,config.appUrl);
 try {
  const response=await request('https://api.resend.com/emails',{
   method:'POST',signal:AbortSignal.timeout(8500),headers:{
    Authorization:'Bearer '+config.apiKey,'Content-Type':'application/json','Idempotency-Key':'memo-finance/'+job.id,
   },body:JSON.stringify({from:config.from,to:[job.recipient],...content}),
  });
  const body=await response.json().catch(()=>({}));
  if(response.ok){
   if(typeof body.id!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(body.id))return {outcome:'retry'};
   const pause=Number(response.headers.get('x-resend-monthly-quota'))>=2700?'monthly_quota':
    Number(response.headers.get('x-resend-daily-quota'))>=90?'daily_quota':null;
   return pause?{outcome:'sent',providerId:body.id,pause}:{outcome:'sent',providerId:body.id};
  }
  const code=body.name??body.code;
  if(code==='daily_quota_exceeded')return {outcome:'daily_quota'};
  if(code==='monthly_quota_exceeded')return {outcome:'monthly_quota'};
  if(response.status>=500||response.status===429||response.status===408||code==='concurrent_idempotent_requests'){
   const retry=response.headers.get('retry-after');
   const seconds=retry&&/^\d+$/.test(retry)?Number(retry):0;
   return {outcome:'retry',delay:Math.min(seconds,3600)};
  }
  return {outcome:'provider_rejected'};
 }catch{return {outcome:'retry'};}
}
