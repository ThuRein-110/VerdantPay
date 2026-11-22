'use server';

import {z} from 'zod';
import {revalidatePath} from 'next/cache';
import {financeOwner} from './membership';

const assignment=z.object({user:z.uuid(),role:z.enum(['admin','team','revoked']),member:z.union([z.uuid(),z.literal('')])})
 .refine(values=>values.role==='team'?!!values.member:!values.member);

export async function updateMembership(form:FormData):Promise<'saved'|'invalid'|'denied'|'conflict'|'error'> {
 try {
  const owner=await financeOwner();
  if(!owner)return 'denied';
  const input=assignment.safeParse(Object.fromEntries(form));
  if(!input.success)return 'invalid';
  const {user,role,member}=input.data;
  const {data,error}=await owner.db.rpc('finance_set_membership' as never,
   {p_user:user,p_role:role,p_member:member||null} as never);
  if(error?.code==='23505')return 'conflict';
  if(error||!data)return 'error';
  revalidatePath('/finance');
  return 'saved';
 }catch{return 'error';}
}
