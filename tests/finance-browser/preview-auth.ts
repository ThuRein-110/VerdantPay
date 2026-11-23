import {createHmac} from 'node:crypto';
import {admin,applicant,applicantSession,customer,session} from '../finance-db-fixture';

export const frontend='http://localhost:3311';
export const backend='http://127.0.0.1:3312';
export const previewAnon='fixture-anon-key';
export const previewService='fixture-service-key';
export const factor='88888888-8888-4888-8888-888888888888';
export const actors={
 admin:{id:admin,aal:'aal2',session,email:'admin@example.test'},
 unverified:{id:admin,aal:'aal1',session,email:'admin@example.test'},
 customer:{id:customer,aal:'aal2',session,email:'customer@example.test'},
 applicant:{id:applicant,aal:'aal1',session:applicantSession,email:'applicant@example.test'},
 team:{id:applicant,aal:'aal2',session:applicantSession,email:'applicant@example.test'},
} as const;
export type Actor=keyof typeof actors;
export function previewUser(actor:Actor) {
 return {id:actors[actor].id,aud:'authenticated',role:'authenticated',email:actors[actor].email,app_metadata:{provider:'email'},
  user_metadata:{full_name:'Fixture Applicant'},created_at:'2026-01-01T00:00:00Z',email_confirmed_at:'2026-01-01T00:00:00Z',
  factors:[{id:factor,factor_type:'totp',status:'verified'}]};
}
const encode=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
export function previewSession(actor:Actor,minutesAgo=0) {
 const now=Math.floor(Date.now()/1000);
 const exp=now+7200;
 const header=encode({alg:'HS256',typ:'JWT'});
 const amr=[{method:actors[actor].aal==='aal2'?'totp':'password',timestamp:now-minutesAgo*60}];
 const payload=encode({sub:actors[actor].id,aal:actors[actor].aal,amr,session_id:actors[actor].session,role:'authenticated',exp,iss:backend+'/auth/v1'});
 const signature=createHmac('sha256','loopback-finance-fixture').update(header+'.'+payload).digest('base64url');
 return {access_token:header+'.'+payload+'.'+signature,refresh_token:'fixture-'+actor,
  expires_at:exp,expires_in:7200,token_type:'bearer',user:previewUser(actor)};
}
export function cookie(actor:Actor,minutesAgo=0) {
 return 'base64-'+encode(previewSession(actor,minutesAgo));
}
export function previewActor(token:string):Actor|null {
 try {
  const [header,payload,signature]=token.split('.');
  if(createHmac('sha256','loopback-finance-fixture').update(header+'.'+payload).digest('base64url')!==signature) return null;
  const {sub,aal,exp}=JSON.parse(Buffer.from(payload,'base64url').toString());
  if(exp<=Date.now()/1000)return null;
  return (Object.keys(actors) as Actor[]).find(actor=>actors[actor].id===sub&&actors[actor].aal===aal)??null;
 } catch {return null;}
}
