// Provider tokens are unnecessary for MEMO. Remove them before the SDK can persist a session.
export async function authFetch(input:RequestInfo|URL,init?:RequestInit){
 const response=await fetch(input,init),url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
 if(!url.pathname.startsWith('/auth/v1/')||!response.headers.get('content-type')?.includes('application/json'))return response;
 const data:unknown=await response.json();
 const record=data&&typeof data==='object'?data as Record<string,unknown>:null;
 for(const candidate of [record,record?.session])if(candidate&&typeof candidate==='object'){
  const fields=candidate as Record<string,unknown>;
  delete fields.provider_token;
  delete fields.provider_refresh_token;
 }
 const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('content-encoding');return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
}
