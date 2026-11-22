import {createHmac} from 'node:crypto';
import {admin,customer,session} from '../finance-db-fixture';

export const frontend='http://127.0.0.1:3311';
export const backend='http://127.0.0.1:3312';
export const previewAnon='fixture-anon-key';
export const previewService='fixture-service-key';
export const actors={admin:{id:admin,aal:'aal2'},customer:{id:customer,aal:'aal2'},unverified:{id:admin,aal:'aal1'}} as const;
export type Actor=keyof typeof actors;
export function previewUser(actor:Actor) {
 return {id:actors[actor].id,aud:'authenticated',role:'authenticated',email:actor+'@example.test',app_metadata:{provider:'email'},
  user_metadata:{},created_at:'2026-01-01T00:00:00Z',factors:[{id:'fixture-totp',factor_type:'totp',status:'verified'}]};
}
export function cookie(actor:Actor) {
 const exp=Math.floor(Date.now()/1000)+7200;
 const encode=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
 const header=encode({alg:'HS256',typ:'JWT'});
 const payload=encode({sub:actors[actor].id,aal:actors[actor].aal,session_id:session,role:'authenticated',exp,iss:backend+'/auth/v1'});
 const signature=createHmac('sha256','loopback-finance-fixture').update(header+'.'+payload).digest('base64url');
 return 'base64-'+encode({access_token:header+'.'+payload+'.'+signature,refresh_token:'fixture-'+actor,
  expires_at:exp,expires_in:7200,token_type:'bearer',user:previewUser(actor)});
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
