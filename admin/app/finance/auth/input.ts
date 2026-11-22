import {z} from 'zod';

export const email=z.string().trim().toLowerCase().max(254).pipe(z.email());
const personalName=z.string().trim().min(1).max(120).refine(value=>!/[\p{Cc}]/u.test(value));
const strong=z.string().min(12).max(72).refine(password=>
 new TextEncoder().encode(password).length<=72&&/\p{L}/u.test(password)&&/[\p{N}\p{P}\p{S}]/u.test(password),
);
const credentials={password:strong,confirmation:z.string()};
const matches=(values:{password:string;confirmation:string})=>values.password===values.confirmation;
export const authInput=z.discriminatedUnion('action',[
 z.object({action:z.literal('signup'),name:personalName,email,...credentials}).refine(matches,{path:['confirmation']}),
 z.object({action:z.literal('login'),email,password:z.string().min(1).max(128)}),
 z.object({action:z.literal('forgot'),email}),
 z.object({action:z.literal('reset'),...credentials}).refine(matches,{path:['confirmation']}),
 z.object({action:z.enum(['logout','mfa','request'])}),
 z.object({action:z.literal('verify-mfa'),factor:z.uuid(),code:z.string().regex(/^\d{6}$/)}),
]);
