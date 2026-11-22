import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {admin,applicant,financeDatabase,financeSeed,identity} from '../finance-db-fixture';
import {actors,backend,factor,frontend,previewActor,previewService,previewSession,previewUser} from './preview-auth';

const identifier=(value:string)=>{
 if(!/^[a-z_]+$/.test(value))throw Error('Unsupported fixture identifier');
 return '"'+value+'"';
};

async function start() {
 const db=await financeDatabase();
 const sample=await financeSeed(db);
 await db.exec(`reset role;update public.finance_memberships set role='owner' where user_id='${admin}'`);
 let queue=Promise.resolve();
 let passwordHash='';
 let confirmed=false;
 const codes=new Map<string,{challenge:string;kind:'signup'|'recovery'}>();
 const mailbox=new Map<string,string>();
 const challenges=new Map<string,{challenge:string;user?:string}>();
 const passkeys=new Map<string,{id:string;user:string;credential:string;friendly_name:string;created_at:string;last_used_at?:string}>();
 const hash=(value:string)=>createHash('sha256').update(value).digest('base64url');
 const respond=(res:ServerResponse,body:unknown,status=200)=>{
  res.writeHead(status,{'content-type':'application/json'});
  res.end(JSON.stringify(body));
 };
 const server=createServer(async (req:IncomingMessage,res:ServerResponse)=>{
  const chunks=[];
  for await (const chunk of req)chunks.push(chunk);
  const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{};
  const url=new URL(req.url??'/',backend);
  const token=String(req.headers.authorization??'').replace(/^Bearer /,'');
  const actor=previewActor(token);
  const path=url.pathname;
  if(path==='/health'){respond(res,{ready:true,today:sample.today});return;}
  const run=async()=>{
   try {
    const authError=(code:string,status=400)=>respond(res,{code,message:code},status);
    const sendLink=(kind:'signup'|'recovery')=>{
     const redirect=new URL(url.searchParams.get('redirect_to')??'');
     if(redirect.href!==frontend+'/finance/auth/callback')throw Error('Unexpected redirect');
     const code=randomUUID();
     codes.set(code,{challenge:body.code_challenge,kind});
     redirect.searchParams.set('code',code);
     mailbox.set(kind,redirect.href);
    };
    if(path==='/mailbox')return respond(res,{link:mailbox.get(url.searchParams.get('kind')??'')});
    if(path.startsWith('/auth/v1/passkeys')){
     const current=actor?actors[actor].id:undefined;
     const rpId=new URL(frontend).hostname;
     if(path.endsWith('/options')){
      const registration=path.includes('/registration/');
      if(registration&&!current)return authError('session_not_found',401);
      const id=randomUUID(), challenge=randomBytes(32).toString('base64url');
      challenges.set(id,{challenge,user:registration?current:undefined});
      const options=registration?{challenge,rp:{id:rpId,name:'VerdantPay'},user:{
       id:Buffer.from(current!).toString('base64url'),name:actors[actor!].email,displayName:'Fixture Account',
      },pubKeyCredParams:[{type:'public-key',alg:-7}],authenticatorSelection:{residentKey:'required',userVerification:'required'}}:
       {challenge,rpId,userVerification:'required'};
      return respond(res,{challenge_id:id,options,expires_at:Math.floor(Date.now()/1000)+300});
     }
     if(path.endsWith('/verify')){
      const found=challenges.get(body.challenge_id);
      challenges.delete(body.challenge_id);
      const client=JSON.parse(Buffer.from(body.credential?.response?.clientDataJSON??'','base64url').toString());
      if(!found||client.challenge!==found.challenge||client.origin!==frontend)return authError('webauthn_challenge_expired');
      if(path.includes('/registration/')){
       if(!current||found.user!==current||client.type!=='webauthn.create')return authError('session_not_found',401);
       const item={id:randomUUID(),user:current,credential:body.credential.id,friendly_name:'Virtual passkey',created_at:new Date().toISOString()};
       passkeys.set(item.id,item);
       return respond(res,item);
      }
      const item=[...passkeys.values()].find(entry=>entry.credential===body.credential.id);
      if(!item||found.user||client.type!=='webauthn.get')return authError('invalid_credentials');
      item.last_used_at=new Date().toISOString();
      return respond(res,previewSession(item.user===admin?'unverified':'applicant'));
     }
     if(!current)return authError('session_not_found',401);
     if(path==='/auth/v1/passkeys')return respond(res,[...passkeys.values()].filter(item=>item.user===current));
     const id=path.split('/').at(-1)!;
     const item=passkeys.get(id);
     if(!item||item.user!==current)return authError('not_found',404);
     if(req.method==='PATCH'){item.friendly_name=body.friendly_name;return respond(res,item);}
     if(req.method==='DELETE'){passkeys.delete(id);res.writeHead(204);res.end();return;}
    }
    if(path==='/auth/v1/signup'){
     if(passwordHash)return authError('user_already_exists',422);
     if(body.email!==actors.applicant.email)return authError('unexpected_fixture_email');
     sendLink('signup');
     passwordHash=hash(body.password);
     return respond(res,{...previewUser('applicant'),email_confirmed_at:null,factors:[]});
    }
    if(path==='/auth/v1/recover'){
     if(confirmed&&body.email===actors.applicant.email)sendLink('recovery');
     return respond(res,{});
    }
    if(path==='/auth/v1/token'){
     if(url.searchParams.get('grant_type')==='password'){
      if(body.email===actors.admin.email&&body.password==='synthetic-password')return respond(res,previewSession('unverified'));
      if(confirmed&&body.email===actors.applicant.email&&hash(body.password)===passwordHash)return respond(res,previewSession('applicant'));
      return authError('invalid_credentials');
     }
     const saved=codes.get(body.auth_code);
     if(!saved||typeof body.code_verifier!=='string'||hash(body.code_verifier)!==saved.challenge)return authError('bad_code_verifier');
     codes.delete(body.auth_code);
     if(saved.kind==='signup'){
      await db.exec(`reset role;update auth.users set email_confirmed_at=now() where id='${applicant}'`);
      confirmed=true;
     }
     return respond(res,previewSession('applicant'));
    }
    if(path==='/auth/v1/user'){
     if(!actor)return authError('session_not_found',401);
     if(req.method==='PUT'&&actor==='applicant')passwordHash=hash(body.password);
     return respond(res,previewUser(actor));
    }
    if(path==='/auth/v1/logout'){res.writeHead(204);res.end();return;}
    if(actor&&path==='/auth/v1/factors/'+factor+'/challenge')return respond(res,{id:randomUUID()});
    if(actor&&path==='/auth/v1/factors/'+factor+'/verify'){
     if(body.code!=='123456')return authError('mfa_verification_failed');
     return respond(res,previewSession(actors[actor].id===applicant?'team':'admin'));
    }
    if(path==='/rest/v1/rpc/take_rate_limit'&&token===previewService)return respond(res,true);
    if(path==='/rest/v1/rpc/customer_session_active'&&token===previewService){
     await db.exec('reset role;set role service_role');
     return respond(res,(await db.query<{value:boolean}>('select public.customer_session_active($1,$2) value',[body.p_session,body.p_owner])).rows[0].value);
    }
    if(path==='/rest/v1/rpc/finance_email_request'&&token===previewService){
     await db.exec('reset role;set role service_role');
     const code='0123456789abcdef01234567';
     const hash=createHash('sha256').update(code).digest('hex');
     return respond(res,(await db.query<{value:boolean}>('select public.finance_email_request($1,$2,$3) value',[body.p_email,code,hash])).rows[0].value);
    }
    if(!actor)return respond(res,{message:'No session'},401);
    await identity(db,actors[actor].id,actors[actor].aal);
    if(path==='/rest/v1/rpc/is_admin')return respond(res,(await db.query<{value:boolean}>('select public.is_admin() value')).rows[0].value);
    const membershipRpc:Record<string,unknown[]>={
     finance_access_role:[],finance_request_access:[body.p_name],finance_membership_admin:[body.p_offset],
     finance_set_membership:[body.p_user,body.p_role,body.p_member],finance_my_allocations:[],
    };
    const rpc=path.split('/').at(-1)??'';
    const parameters=membershipRpc[rpc];
    if(Object.hasOwn(membershipRpc,rpc)){
     const sql='select public.'+identifier(rpc)+'('+parameters.map((_,index)=>'$'+(index+1)).join(',')+') value';
     return respond(res,(await db.query<{value:unknown}>(sql,parameters)).rows[0].value);
    }
    if(path==='/rest/v1/rpc/finance_email_status')return respond(res,(await db.query<{value:unknown}>('select public.finance_email_status() value')).rows[0].value);
    if(path==='/rest/v1/rpc/finance_email_verify')return respond(res,(await db.query<{value:boolean}>('select public.finance_email_verify($1) value',[body.p_hash])).rows[0].value);
    if(path==='/rest/v1/rpc/finance_email_save')return respond(res,(await db.query<{value:boolean}>('select public.finance_email_save($1,$2::text[]) value',[body.p_enabled,body.p_kinds])).rows[0].value);
    if(path==='/rest/v1/rpc/finance_email_test')return respond(res,(await db.query<{value:boolean}>('select public.finance_email_test() value')).rows[0].value);
    if(path==='/rest/v1/rpc/finance_overview')return respond(res,(await db.query<{value:unknown}>(
     'select public.finance_overview($1,$2) value',[body.p_from,body.p_to])).rows[0].value);
    if(path==='/rest/v1/rpc/finance_write')return respond(res,(await db.query<{value:string}>(
     'select public.finance_write($1,$2,$3::jsonb) value',[body.p_action,body.p_key,JSON.stringify(body.p_data)])).rows[0].value);
    if(path==='/rest/v1/rpc/finance_record_income')return respond(res,(await db.query<{value:string}>(
     'select public.finance_record_income($1,$2::jsonb) value',[body.p_key,JSON.stringify(body.p_data)])).rows[0].value);
    if(path==='/rest/v1/rpc/finance_save_goal')return respond(res,(await db.query<{value:boolean}>(
     'select public.finance_save_goal($1,$2,$3,$4,$5,$6) value',[body.p_id,body.p_version,body.p_title,body.p_target,body.p_saved,body.p_deadline])).rows[0].value);
    const relation=path.match(/^\/rest\/v1\/(finance_[a-z_]+)$/)?.[1];
    if(!relation||req.method!=='GET')return respond(res,{message:'Unexpected fixture request '+path},404);
    const columns=(url.searchParams.get('select')??'*').split(',').map(name=>name==='*'?'*':identifier(name)).join(',');
    const args:(string|boolean)[]=[];
    const clauses:string[]=[];
    for(const [column,raw] of url.searchParams){
     if(['select','order','limit','offset'].includes(column))continue;
     const match=/^(eq|gte|lte|ilike)\.(.*)$/.exec(raw);
     if(!match)throw Error('Unexpected filter '+raw);
     args.push(['enabled','voided','eligible','completed'].includes(column)?match[2]==='true':match[2]);
     const op={eq:'=',gte:'>=',lte:'<=',ilike:'ilike'}[match[1]];
     clauses.push(identifier(column)+' '+op+' $'+args.length);
    }
    const where=clauses.length?' where '+clauses.join(' and '):'';
    const order=url.searchParams.get('order')?.split(',').map(item=>{
     const [column,direction]=item.split('.');
     return identifier(column)+(direction==='desc'?' desc':' asc');
    }).join(',');
    const offset=Math.max(0,Number(url.searchParams.get('offset'))||0);
    const limit=Math.min(1000,Math.max(1,Number(url.searchParams.get('limit'))||1000));
    const table='public.'+identifier(relation);
    const {rows}=await db.query<{value:unknown}>('select to_jsonb(result) value from (select '+columns+' from '+table+where+
     (order?' order by '+order:'')+' offset '+offset+' limit '+limit+') result',args);
    const count=(await db.query<{total:string}>('select count(*)::text total from '+table+where,args)).rows[0].total;
    res.setHeader('content-range',rows.length===0?'*/'+count:offset+'-'+(offset+rows.length-1)+'/'+count);
    const singular=String(req.headers.accept).includes('application/vnd.pgrst.object');
    respond(res,singular?rows[0]?.value??null:rows.map(row=>row.value));
   } catch(error) {
    const e=error as Error&{code?:string};
    respond(res,{message:e.message,code:e.code??'fixture_error'},400);
   }
  };
  queue=queue.then(run,run);
 });
 server.listen(3312,'127.0.0.1',()=>console.log('Finance test fixture on '+backend));
}
void start();
