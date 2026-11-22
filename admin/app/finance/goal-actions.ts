'use server';

import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import {authorization} from './data';
import {day,money} from './model';

const fields=z.object({
 id:z.uuid(),version:z.coerce.number().int().min(0).max(2147483646),
 title:z.string().trim().min(1).max(100),
 target:money.refine(value=>value!=='0'),saved:money,deadline:z.union([day,z.literal('')]),
});

export async function saveGoal(form:FormData) {
 const context=await authorization();
 if(!context)return 'auth';
 const result=fields.safeParse(Object.fromEntries(form));
 if(!result.success)return 'invalid';
 const {id,version,title,target,saved,deadline}=result.data;
 const {data,error}=await context.db.rpc('finance_save_goal' as never,{
  p_id:id,p_version:version,p_title:title,p_target:target,p_saved:saved,p_deadline:deadline||null,
 } as never);
 if(error)return 'error';
 if(!data)return 'conflict';
 revalidatePath('/finance');
 return 'saved';
}
