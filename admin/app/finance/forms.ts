import {capitalKinds, consumptionKinds, type Action, type L, type Section} from './model';
import type {Row} from './data';

export type Choice = {value:string; label:string; price?:string};
export type Field = {key:string; label:string; type?:'date'|'number'|'select'|'memo'; optional?:boolean; value?:string; list?:Choice[]; step?:string; min?:string; max?:string};
export type Form = {action:Action; title:string; fields:Field[]; repeat?:{key:string; fields:Field[]; minimum?:number; maximum:number; initial?:Record<string,string>[]}; cost?:'estimate'|'actual'; confirm?:string};
export type Lookups = Record<'accounts'|'sales'|'expenses'|'orders'|'spools'|'assets'|'members'|'recurring', Choice[]>;

const codeLabels:Record<string,readonly [string,string]> = {
 receipt:['Receipt','รับชำระ'],refund:['Refund','คืนเงิน'],expense:['Expense','ค่าใช้จ่าย'],sale:['Sale','การขาย'],
 eligible:['After eligible operating costs','หลังหักค่าใช้จ่ายที่เข้าเกณฑ์'],gross:['Gross profit','กำไรขั้นต้น'],net:['Net profit','กำไรสุทธิ'],
 monthly:['Monthly','รายเดือน'],per_order:['Per order','รายคำสั่งซื้อ'],owner_contribution:['Owner contribution','เงินทุนเจ้าของ'],
 team_contribution:['Team contribution','เงินทุนจากทีม'],loan:['Loan proceeds','เงินกู้รับ'],loan_repayment:['Loan principal repayment','ชำระคืนเงินต้น'],
 owner_withdrawal:['Owner withdrawal','เจ้าของถอนเงิน'],capital_repayment:['Capital repayment','คืนเงินทุน'],
 filament_purchase:['Filament purchase','ซื้อเส้นพิมพ์'],equipment:['Equipment purchase','ซื้ออุปกรณ์'],
 transfer_in:['Transfer in','โอนเข้า'],transfer_out:['Transfer out','โอนออก'],team_payout:['Team payout','จ่ายส่วนแบ่งทีม'],
 model:['Model','ชิ้นงาน'],supports:['Supports','โครงรองรับ'],brim:['Brim','ขอบยึดฐาน'],purge:['Purge','ไล่เส้นพิมพ์'],
 failed:['Failed print','พิมพ์ล้มเหลว'],calibration:['Calibration','ปรับเทียบ'],
};
export function code(value:string,l:L) {
 const label = codeLabels[value];return label ? l(...label) : value;
}

export function definitions(l:L, lists:Lookups, today:string) {
 const choice=(keys:readonly string[])=>keys.map(value=>({value,label:code(value,l)}));
 const field=(key:string,label:string,optional=false,value?:string):Field=>({key,label,optional,value});
 const number=(key:string,label:string,value='0',step='0.01',min='0'):Field=>({key,label,type:'number',value,step,min});
 const select=(key:string,label:string,list:Choice[],optional=false):Field=>({key,label,type:'select',list,optional});
 const date=(label=l('Date','วันที่'),value=today):Field=>({key:'day',label,type:'date',value});
 const priorMonth = new Date(today.slice(0,7)+'-01T00:00:00Z');
 priorMonth.setUTCMonth(priorMonth.getUTCMonth()-1);
 const amount=number('amount',l('Amount (THB)','จำนวนเงิน (บาท)'), '');
 const account=select('account',l('Account','บัญชี'),lists.accounts);
 const target=(label:string,list:Choice[],optional=false)=>select('target',label,list,optional);
 const notes:Field={key:'notes',label:l('Notes','หมายเหตุ'),type:'memo',optional:true};
 const reason={...notes,label:l('Reason','เหตุผล'),optional:false};
 const record= (action:Action,title:string,fields:Field[],extra:Partial<Form>={}):Form=>({action,title,fields,...extra});
 const expenseFields=[select('category',l('Expense category','หมวดหมู่ค่าใช้จ่าย'),lists.expenses),
  field('description',l('Description','รายการ')),field('vendor',l('Vendor','ผู้ขาย'),true),amount,
  {...account,optional:true,label:l('Pay from account (optional)','จ่ายจากบัญชี (ไม่บังคับ)')},
  {...select('eligible',l('Eligible for profit sharing','นับในฐานส่วนแบ่งกำไร'),[{value:'true',label:l('Eligible','นับ')},{value:'false',label:l('Excluded','ไม่นับ')}]),value:'true'}];
 const order=record('order',l('Add sale','เพิ่มยอดขาย'),
  [field('reference',l('Order ID','เลขคำสั่งซื้อ')),field('customer',l('Customer name','ชื่อลูกค้า')),field('contact',l('Customer contact','ข้อมูลติดต่อลูกค้า'),true),date(l('Order date','วันที่สั่งซื้อ')),notes],
  {repeat:{key:'lines',minimum:1,maximum:25,fields:[select('category',l('Service category','หมวดหมู่บริการ'),lists.sales),
   field('description',l('Product / service','สินค้า / บริการ')),number('quantity',l('Quantity','จำนวน'),'1','1','1'),
   number('unit',l('Unit price (THB)','ราคาต่อหน่วย (บาท)'),''),
   number('discount',l('Discount (THB)','ส่วนลด (บาท)')),number('fee',l('Additional fees (THB)','ค่าธรรมเนียม (บาท)'))]}});
 const payment=record('payment',l('Record payment or refund','บันทึกรับหรือคืนเงิน'),
  [target(l('Order','คำสั่งซื้อ'),lists.orders),date(),{...select('kind',l('Type','ประเภท'),choice(['receipt','refund'])),value:'receipt'},account,amount,notes]);
 const manualIncome=record('manual_income',l('Add income','เพิ่มรายรับ'),
  [date(),select('category',l('Income category','หมวดหมู่รายรับ'),lists.sales),field('description',l('Description','รายการ')),account,amount,notes]);
 const expense=record('expense',l('Add expense','เพิ่มค่าใช้จ่าย'),
  [date(),...expenseFields,target(l('Related order','คำสั่งซื้อที่เกี่ยวข้อง'),lists.orders,true),notes]);
 const spool=record('spool',l('Add filament purchase','เพิ่มการซื้อเส้นพิมพ์'),
  [date(l('Purchase date','วันที่ซื้อ')),field('material',l('Material','วัสดุ'),false,'PETG'),field('color',l('Color','สี')),
   field('brand',l('Brand','ยี่ห้อ'),true),number('gross',l('Spool weight with filament (g)','น้ำหนักม้วนรวมเส้น (กรัม)'),'1000','0.001'),
   number('tare',l('Empty spool tare (g)','น้ำหนักม้วนเปล่า (กรัม)'),'0','0.001'),{...amount,label:l('Purchase price (THB)','ราคาซื้อ (บาท)')},
   account,field('location',l('Storage location','สถานที่เก็บ'),true),notes]);
 const recurring=record('recurring',l('Add recurring expense','เพิ่มค่าใช้จ่ายประจำ'),
  [...expenseFields,select('enabled',l('Status','สถานะ'),[{value:'true',label:l('Active','ใช้งาน')},{value:'false',label:l('Inactive','ปิดใช้งาน')}])]);
 const category=record('category',l('Add category','เพิ่มหมวดหมู่'),
  [field('description',l('Category name','ชื่อหมวดหมู่')),select('kind',l('Type','ประเภท'),choice(['sale','expense'])),{...amount,value:'0',label:l('Default unit price (THB)','ราคาเริ่มต้น (บาท)')}]);
 const member=record('member',l('Add team member','เพิ่มสมาชิกทีม'),[field('description',l('Member name','ชื่อสมาชิก'))]);
 const job=record('job',l('Save estimate to order','บันทึกประมาณการให้คำสั่งซื้อ'),[target(l('Order','คำสั่งซื้อ'),lists.orders)],{cost:'estimate'});
 const sectionForms:Partial<Record<Section,Form[]>>={
  orders:[order], income:[manualIncome,payment], expenses:[expense,recurring,record('expense',l('Post recurring expense','ลงรายการค่าใช้จ่ายประจำ'),
   [date(),select('recurring',l('Template','รายการต้นแบบ'),lists.recurring),notes])],
  inventory:[spool], calculator:[job],
  team:[record('close',l('Close month','ปิดเดือน'),
   [date(l('First day of month','วันแรกของเดือน'),priorMonth.toISOString().slice(0,10))],{confirm:l('Closing freezes this month and earlier periods. Continue?','การปิดเดือนจะล็อกงวดนี้และงวดก่อนหน้า ดำเนินการต่อหรือไม่?')})],
  investments:[
   record('capital',l('Record capital movement','บันทึกรายการเงินทุน'),
    [date(),select('kind',l('Transaction type','ประเภทรายการ'),choice(capitalKinds)),field('contributor',l('Contributor / recipient','ผู้ให้ทุน / ผู้รับเงิน')),amount,account,target(l('Related equipment','อุปกรณ์ที่เกี่ยวข้อง'),lists.assets,true),notes]),
   record('asset',l('Record equipment purchase','บันทึกซื้ออุปกรณ์'),[date(),field('description',l('Equipment name','ชื่ออุปกรณ์')),amount,
    number('salvage',l('Salvage value (THB)','มูลค่าคงเหลือ (บาท)')),
    {...number('months',l('Useful life (months)','อายุใช้งาน (เดือน)'),'','1','1'),optional:true,max:'600'},account,notes])],
  cash:[record('transfer',l('Record account transfer','บันทึกโอนระหว่างบัญชี'),[date(),{...account,label:l('From account','จากบัญชี')},target(l('To account','ไปยังบัญชี'),lists.accounts),amount,notes])],
  settings:[
   record('account',l('Add account','เพิ่มบัญชี'),[field('description',l('Account name','ชื่อบัญชี'))]),category,member,
   record('agreement',l('Add effective-dated agreement','เพิ่มข้อตกลงตามวันที่มีผล'),[date(l('Effective date','วันที่มีผล')),select('basis',l('Distributable profit base','ฐานกำไรที่จัดสรร'),choice(['eligible','net','gross'])),
    select('method',l('Method','วิธีจัดสรร'),choice(['monthly','per_order']))],
    {repeat:{key:'members',maximum:30,fields:[select('member',l('Team member','สมาชิกทีม'),lists.members),{...number('points',l('Share (%)','ส่วนแบ่ง (%)'),'15'),max:'100'}]}})],
 };
 const recognize=record('recognize',l('Recognize revenue','รับรู้รายได้'),[date(l('Recognition date','วันที่รับรู้'))],{confirm:l('Recognize this completed order?','รับรู้รายได้ของคำสั่งซื้อนี้หรือไม่?')});
 const cancel=record('cancel',l('Cancel order','ยกเลิกคำสั่งซื้อ'),[date(),reason],{confirm:l('Cancel this order?','ยกเลิกคำสั่งซื้อนี้หรือไม่?')});
 const rowForms:Record<string,(row:Row)=>Form[]> = {
  orders:row=>row.cancelled_on ? [] : [payment, ...(!row.recognized_on?[recognize,cancel]:[])].map(form=>({...form,fields:form.fields.filter(input=>input.key!=='target')})),
  expenses:row=>row.voided ? [] : [
   ...(!row.paid_on?[record('pay_expense',l('Pay bill','จ่ายบิล'),[date(),account,notes])]:[]),
   record('void_expense',l('Void expense','ยกเลิกรายการค่าใช้จ่าย'),[reason],{confirm:l('Void this expense entry?','ยกเลิกรายการค่าใช้จ่ายนี้หรือไม่?')})],
  stock:()=>[record('stock_adjust',l('Adjust stock','ปรับยอดคลัง'),[date(),number('grams',l('Signed change (g)','การเปลี่ยนแปลง (+/− กรัม)'),'','0.001','-999999999'),reason])],
  jobs:row=>row.reversed_on?[]:row.finished_on?
   [record('reverse_job',l('Reverse job','กลับรายการงาน'),[date(),reason],{confirm:l('Reverse this job and restore its filament?','กลับรายการงานนี้และคืนเส้นพิมพ์เข้าคลังหรือไม่?')})]:
   [record('finalize',l('Finalize job','ปิดงานพิมพ์'),[date(l('Completion date','วันที่เสร็จ')),notes],
    {cost:'actual',repeat:{key:'materials',maximum:30,fields:[select('spool',l('Spool','ม้วนเส้นพิมพ์'),lists.spools),
     select('kind',l('Consumption type','ประเภทการใช้'),choice(consumptionKinds)),number('grams',l('Actual grams','กรัมจริง'),'','0.001','0.001')]}})],
  allocations:row=>row.member_id ? [
   ...(Number(row.remaining_satang)>0?[record('payout',l('Record team payment','บันทึกจ่ายส่วนแบ่ง'),[date(),account,amount,notes])]:[]),
   record('allocation_adjust',l('Adjust team allocation','ปรับส่วนแบ่งทีม'),[{...amount,label:l('Signed change (THB)','การเปลี่ยนแปลง (+/− บาท)'),min:'-999999999'},reason])]:[],
 };
 return {sectionForms,rowForms,editable:{orders:order,recurring,categories:category,members:member}};
}
