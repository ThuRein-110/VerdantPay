import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {financeDatabase,financeSeed,identity} from '../finance-db-fixture';
import {actors,backend,previewActor,previewService,previewUser} from './preview-auth';

const identifier=(value:string)=>{
 if(!/^[a-z_]+$/.test(value))throw Error('Unsupported fixture identifier');
 return '"'+value+'"';
};

async function start() {
 const db=await financeDatabase();
 const sample=await financeSeed(db);
 let queue=Promise.resolve();
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
  if(path==='/auth/v1/user'){
   if(actor)respond(res,previewUser(actor));
   else respond(res,{message:'No session'},401);
   return;
  }
  const run=async()=>{
   try {
    if(path==='/rest/v1/rpc/customer_session_active'&&token===previewService){
     await db.exec('reset role;set role service_role');
     return respond(res,(await db.query<{value:boolean}>('select public.customer_session_active($1,$2) value',[body.p_session,body.p_owner])).rows[0].value);
    }
    if(!actor)return respond(res,{message:'No session'},401);
    await identity(db,actors[actor].id,actors[actor].aal);
    if(path==='/rest/v1/rpc/is_admin')return respond(res,(await db.query<{value:boolean}>('select public.is_admin() value')).rows[0].value);
    if(path==='/rest/v1/rpc/finance_overview')return respond(res,(await db.query<{value:unknown}>(
     'select public.finance_overview($1,$2) value',[body.p_from,body.p_to])).rows[0].value);
    if(path==='/rest/v1/rpc/finance_write')return respond(res,(await db.query<{value:string}>(
     'select public.finance_write($1,$2,$3::jsonb) value',[body.p_action,body.p_key,JSON.stringify(body.p_data)])).rows[0].value);
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
