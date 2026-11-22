import Decimal from 'decimal.js';
import {z} from 'zod';

export const sections = {
 overview: ['Overview', 'ภาพรวม'], records: ['Records','รายการ'], orders: ['Orders', 'คำสั่งซื้อ'], income: ['Income', 'รายรับ'],
 expenses: ['Expenses', 'ค่าใช้จ่าย'], inventory: ['Filament inventory', 'คลังเส้นพิมพ์'],
 calculator: ['Print cost calculator', 'คำนวณต้นทุนพิมพ์'], profit: ['Profit & loss', 'กำไรและขาดทุน'],
 team: ['Team Payouts', 'จ่ายส่วนแบ่งทีม'], investments: ['Investments', 'เงินลงทุน'],
 cash: ['Cash flow', 'กระแสเงินสด'], reports: ['Reports', 'รายงาน'], goals: ['Business goals','เป้าหมายธุรกิจ'], settings: ['Settings', 'การตั้งค่า'],
} as const;
export type Section = keyof typeof sections;
export type L = (english: string, thai: string) => string;
export const consumptionKinds = ['model', 'supports', 'brim', 'purge', 'failed', 'calibration'] as const;
export const capitalKinds = ['owner_contribution','team_contribution','loan','loan_repayment','owner_withdrawal','capital_repayment'] as const;

const Money = Decimal.clone({precision: 40, rounding: Decimal.ROUND_HALF_UP});
const decimalString = z.string().regex(/^\d{1,9}(\.\d{1,3})?$/);
const moneyString = z.string().regex(/^\d{1,9}(\.\d{1,2})?$/);
export const money = moneyString.transform(value => new Money(value).mul(100).toFixed(0));
export const signedMoney = z.string().regex(/^-?\d{1,9}(\.\d{1,2})?$/).transform(value => new Money(value).mul(100).toFixed(0));
export const day = z.iso.date().refine(value => value >= '2000-01-01' && value <= '2199-12-31');
const uuid = z.uuid();
const label = z.string().trim().min(1).max(160);
const notes = z.string().trim().max(1000).optional();
const qty = z.coerce.number().int().min(1).max(100000);
const optUuid = uuid.optional();
const optBool = z.enum(['true','false']).optional();
const line = z.object({category:uuid, description:label, quantity:qty, unit:money, discount:money, fee:money});
const filament = z.object({spool:uuid, kind:z.enum(consumptionKinds), grams:decimalString.refine(value => new Money(value).gt(0))});
const rate = z.object({member:uuid, points:money.refine(value => Number(value) > 0 && Number(value) <= 10000)});
export const costInput = z.object({
 printer: label, material: label, color: label, grams: decimalString, ratePerGram: decimalString,
 hours: decimalString, watts: decimalString, electricityRate: decimalString, laborHours: decimalString,
 laborRate: moneyString, wear: moneyString, packaging: moneyString, delivery: moneyString, failed: moneyString,
 margin: moneyString.refine(value => new Money(value).lt(100)), selling: moneyString,
});
export type CostInput = z.infer<typeof costInput>;
export function calculate(input: CostInput) {
 const d = (key: keyof CostInput) => new Money(input[key]);
 const filament = d('grams').mul(d('ratePerGram'));
 const electricity = d('hours').mul(d('watts')).mul(d('electricityRate')).div(1000);
 const labor = d('laborHours').mul(d('laborRate'));
 const nonMaterial = electricity.plus(labor).plus(d('wear')).plus(d('packaging')).plus(d('delivery')).plus(d('failed'));
 const total = filament.plus(nonMaterial);
 const recommended = total.div(new Money(1).minus(d('margin').div(100)));
 const satang = (value: Decimal) => value.mul(100).toFixed(0);
 return {filament:satang(filament), electricity:satang(electricity), labor:satang(labor), wear:satang(d('wear')),
  packaging:satang(d('packaging')), delivery:satang(d('delivery')), failed:satang(d('failed')),
  nonMaterial:satang(nonMaterial), total:satang(total), recommended:recommended.mul(100).ceil().toFixed(0),
  expected:satang(recommended.mul(100).ceil().div(100).minus(total)), actual:satang(d('selling').minus(total))};
}
const dateTarget = {day, target:uuid, notes};
const expenseFields = {category:uuid, description:label, vendor:notes, amount:money, account:optUuid, eligible:optBool};
const schemas = {
 manual_income:z.object({day,category:uuid,account:uuid,description:label,amount:money.refine(value=>Number(value)>0),notes}),
 order: z.object({day, reference:label.max(100), customer:label, contact:notes, notes, target:optUuid, lines:z.array(line).min(1).max(25)}),
 recognize:z.object(dateTarget), cancel:z.object(dateTarget),
 payment:z.object({...dateTarget, account:uuid, amount:money, kind:z.enum(['receipt','refund'])}),
 expense:z.union([z.object({day,recurring:uuid,notes}),z.object({...expenseFields,day,target:optUuid,notes})]),
 recurring:z.object({...expenseFields,target:optUuid,enabled:optBool}),
 pay_expense:z.object({...dateTarget,account:uuid}), void_expense:z.object({target:uuid,notes}),
 spool:z.object({day,material:label.max(80),color:label.max(80),brand:notes,gross:decimalString,tare:decimalString,amount:money,account:uuid,location:notes,notes}),
 stock_adjust:z.object({...dateTarget,grams:z.string().regex(/^-?\d{1,9}(\.\d{1,3})?$/)}),
 job:z.object({target:uuid,estimate:costInput}),
 finalize:z.object({...dateTarget,materials:z.array(filament).max(30),actual:costInput}),
 reverse_job:z.object(dateTarget),
 asset:z.object({day,description:label,amount:money,salvage:money,months:z.coerce.number().int().min(1).max(600).optional(),account:uuid,notes}),
 capital:z.object({day,kind:z.enum(capitalKinds),contributor:label,amount:money,account:uuid,target:optUuid,notes}),
 transfer:z.object({...dateTarget,account:uuid,amount:money}),
 account:z.object({description:label.max(100)}),
 category:z.object({description:label.max(100),kind:z.enum(['sale','expense']),amount:money,target:optUuid}),
 member:z.object({description:label.max(100),target:optUuid}),
 agreement:z.object({day,basis:z.enum(['eligible','net','gross']),method:z.enum(['monthly','per_order']),members:z.array(rate).max(30)}),
 close:z.object({day}),
 payout:z.object({...dateTarget,account:uuid,amount:money}),
 allocation_adjust:z.object({target:uuid,amount:signedMoney,notes}),
};
export type Action = keyof typeof schemas;
export function validateSubmission(action: string, values: unknown) {
 if (!Object.hasOwn(schemas,action)) throw Error('Unknown finance operation');
 const type = action as Action;
 const parsed = schemas[type].parse(values);
 if (type === 'job') {
  const data = schemas.job.parse(values);
  return {...data, printer:data.estimate.printer, amount:calculate(data.estimate).total};
 }
 if (type === 'finalize') {
  const data = schemas.finalize.parse(values);
  return {...data, amount:calculate(data.actual).nonMaterial};
 }
 return parsed;
}

export type Filters = {from:string; to:string; range:string};
export const bangkokToday = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format();
export function period(input: Record<string,string|string[]|undefined>, today=bangkokToday()): Filters {
 const range = typeof input.range === 'string' ? input.range : 'month';
 const earlier = new Date(today+'T00:00:00Z');
 earlier.setUTCDate(earlier.getUTCDate()-6);
 if (range==='today') return {from:today,to:today,range};
 if (range==='week') return {from:earlier.toISOString().slice(0,10),to:today,range};
 if (range==='year') return {from:today.slice(0,4)+'-01-01',to:today,range};
 const from=day.safeParse(input.from), to=day.safeParse(input.to);
 if(range==='custom' && from.success && to.success && from.data<=to.data &&
  Date.parse(to.data)-Date.parse(from.data)<=366*86400000) return {from:from.data,to:to.data,range};
 return {from:today.slice(0,7)+'-01',to:today,range:'month'};
}
export const thb = (satang: unknown, locale = 'en') => {
 if (typeof satang !== 'number' && typeof satang !== 'string') return '—';
 return new Intl.NumberFormat(locale,{style:'currency',currency:'THB',minimumFractionDigits:2}).format(Number(satang)/100);
};
export const baht = (satang: unknown) => typeof satang==='number' || typeof satang==='string' ? new Money(satang).div(100).toFixed(2) : '';

export function payoutName(name:string,thai:boolean) {
 if(!thai)return name;
 switch(name){
  case 'Team Member 1':return 'สมาชิกทีม 1';
  case 'Team Member 2':return 'สมาชิกทีม 2';
  case 'Owner':return 'เจ้าของ';
  default:return name;
 }
}
