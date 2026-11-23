import type {L,Section} from './model';

export type Pair = readonly [string,string];
export type Column = [key:string,title:Pair,type?:'money'|'grams'|'state'|'code'];
export type Table = {id:string; title:Pair; relation:string; columns:Column[]; date?:string; search?:string; sort?:string; match?:Record<string,string|boolean>};
const columns = {
 date:['occurred_on',['Date','วันที่']], ref:['reference',['Order ID','เลขคำสั่งซื้อ']],
 amount:['amount_satang',['Amount','จำนวนเงิน'],'money'], notes:['notes',['Notes','หมายเหตุ']],
 kind:['kind',['Type','ประเภท'],'code'], name:['name',['Name','ชื่อ']],
} satisfies Record<string,Column>;
const {date,ref,amount,notes,kind,name} = columns;
export const tables: Record<string,Table> = {
 orders:{id:'orders',title:['Orders','คำสั่งซื้อ'],relation:'finance_order_summary',date:'booked_on',search:'reference',columns:[
  ref,['customer',['Customer','ลูกค้า']],['booked_on',['Order date','วันที่สั่งซื้อ']],['order_state',['Status','สถานะ'],'state'],
  ['invoiced_satang',['Invoiced','ยอดเรียกเก็บ'],'money'],['received_satang',['Cash received','เงินรับ'],'money'],['outstanding_satang',['Outstanding','ค้างรับ'],'money']]},
 income:{id:'income',title:['Receipts and refunds','การรับเงินและคืนเงิน'],relation:'finance_payment_register',date:'occurred_on',search:'reference',columns:[date,ref,['account',['Account','บัญชี']],kind,amount,notes]},
 expenses:{id:'expenses',title:['Expense register','ทะเบียนค่าใช้จ่าย'],relation:'finance_expense_register',date:'occurred_on',search:'description',columns:[
  date,['description',['Description','รายการ']],['category',['Category','หมวดหมู่']],['vendor',['Vendor','ผู้ขาย']],amount,['paid_on',['Paid on','วันที่จ่าย']],['expense_state',['Status','สถานะ'],'state'],notes]},
 recurring:{id:'recurring',title:['Recurring expenses','ค่าใช้จ่ายประจำ'],relation:'finance_recurring',search:'name',columns:[name,amount,['enabled',['Active','ใช้งาน'],'state'],['vendor',['Vendor','ผู้ขาย']]]},
 stock:{id:'stock',title:['Filament spools','ม้วนเส้นพิมพ์'],relation:'finance_stock',date:'purchased_on',search:'material',columns:[
  ['material',['Material','วัสดุ']],['color',['Color','สี']],['brand',['Brand','ยี่ห้อ']],['purchased_on',['Purchased','วันที่ซื้อ']],
  ['usable_grams',['Usable grams','กรัมสุทธิ'],'grams'],['remaining_grams',['Remaining grams','กรัมคงเหลือ'],'grams'],['satang_per_gram',['THB / gram','บาท / กรัม'],'grams'],['value_satang',['Stock value','มูลค่าคงเหลือ'],'money'],['location',['Location','สถานที่เก็บ']]]},
 movements:{id:'movements',title:['Stock movements','รายการเคลื่อนไหวคลัง'],relation:'finance_movement_register',date:'occurred_on',search:'material',columns:[date,['material',['Material','วัสดุ']],['color',['Color','สี']],['grams',['Change (g)','เปลี่ยนแปลง (กรัม)'],'grams'],['reason',['Reason','เหตุผล']]]},
 consumption:{id:'consumption',title:['Material consumption','การใช้วัสดุ'],relation:'finance_material_events',date:'occurred_on',search:'material',columns:[date,['material',['Material','วัสดุ']],['color',['Color','สี']],kind,['grams',['Grams','กรัม'],'grams']]},
 jobs:{id:'jobs',title:['Print jobs','งานพิมพ์'],relation:'finance_job_summary',sort:'finished_on',search:'reference',columns:[
  ref,['printer',['Printer','เครื่องพิมพ์']],['estimated_satang',['Estimate','ต้นทุนประมาณการ'],'money'],
  ['actual_satang',['Actual','ต้นทุนจริง'],'money'],['grams',['Filament (g)','เส้นพิมพ์ (กรัม)'],'grams'],['finished_on',['Finalized','วันที่เสร็จ']],['reversed_on',['Reversed','วันที่กลับรายการ']]]},
 profitability:{id:'profitability',title:['Order profitability','กำไรต่อคำสั่งซื้อ'],relation:'finance_order_summary',date:'recognized_on',search:'reference',columns:[
  ref,['customer',['Customer','ลูกค้า']],['recognized_on',['Recognized','วันที่รับรู้']],['received_satang',['Cash received','เงินรับ'],'money'],
  ['grams',['Filament (g)','เส้นพิมพ์ (กรัม)'],'grams'],['material_satang',['Filament cost','ต้นทุนเส้นพิมพ์'],'money'],
  ['production_satang',['Actual production','ต้นทุนผลิตจริง'],'money'],['booked_cost_satang',['Related expenses','ค่าใช้จ่ายที่เกี่ยวข้อง'],'money'],
  ['order_profit_satang',['Order profit','กำไรต่อคำสั่งซื้อ'],'money'],['team_satang',['Team accrual','ส่วนแบ่งทีม'],'money']]},
 allocations:{id:'allocations',title:['Allocation ledger','บัญชีจัดสรรกำไร'],relation:'finance_payout_summary',date:'month',search:'name_snapshot',columns:[
  ['month',['Month','เดือน']],['name_snapshot',['Recipient','ผู้รับ']],['distributable_satang',['Profit base','ฐานกำไร'],'money'],
  amount,['adjustment_satang',['Adjustments','ยอดปรับปรุง'],'money'],['paid_satang',['Paid','จ่ายแล้ว'],'money'],['remaining_satang',['Balance','ยอดคงเหลือ'],'money'],['payout_state',['Status','สถานะ'],'state']]},
 payouts:{id:'payouts',title:['Payment history','ประวัติการจ่าย'],relation:'finance_payout_register',date:'occurred_on',search:'recipient',columns:[date,['recipient',['Recipient','ผู้รับ']],['account',['Account','บัญชี']],amount,notes]},
 assets:{id:'assets',title:['Equipment assets','สินทรัพย์อุปกรณ์'],relation:'finance_asset_register',date:'acquired_on',search:'name',columns:[
  name,['acquired_on',['Acquired','วันที่ซื้อ']],['purchase_satang',['Purchase cost','ราคาซื้อ'],'money'],
  ['salvage_satang',['Salvage value','มูลค่าคงเหลือ'],'money'],['useful_months',['Useful months','อายุใช้งาน (เดือน)']],
  ['book_satang',['Book value','มูลค่าตามบัญชี'],'money'],notes]},
 capital:{id:'capital',title:['Capital movements','รายการเงินทุน'],relation:'finance_capital',date:'occurred_on',search:'contributor',columns:[date,kind,['contributor',['Contributor','ผู้ให้เงินทุน']],amount,notes]},
 cash:{id:'cash',title:['Cash transactions','รายการเงินสด'],relation:'finance_cash_register',date:'occurred_on',search:'account',columns:[date,['account',['Account','บัญชี']],kind,amount,notes]},
 categories:{id:'categories',title:['Categories and prices','หมวดหมู่และราคา'],relation:'finance_categories',sort:'name',search:'name',columns:[name,kind,['default_satang',['Default price','ราคาเริ่มต้น'],'money']]},
 accounts:{id:'accounts',title:['Financial accounts','บัญชีการเงิน'],relation:'finance_accounts',sort:'name',columns:[name]},
 members:{id:'members',title:['Team members','สมาชิกทีม'],relation:'finance_members',sort:'name',columns:[name]},
 agreements:{id:'agreements',title:['Effective agreements','ข้อตกลงส่วนแบ่ง'],relation:'finance_agreement_register',date:'effective_on',columns:[
  ['effective_on',['Effective date','วันที่มีผล']],['basis',['Profit base','ฐานกำไร'],'code'],['method',['Method','วิธีจัดสรร'],'code'],['rates',['Rates','อัตราส่วนแบ่ง']]]},
 audit:{id:'audit',title:['Audit history','ประวัติตรวจสอบ'],relation:'finance_audit',sort:'created_at',search:'action',columns:[['created_at',['Recorded at','เวลาบันทึก']],['action',['Operation','การดำเนินการ']],['entity_id',['Record ID','รหัสรายการ']]]},
};
export const sectionTables: Partial<Record<Section,string[]>>={
 orders:['orders','profitability'],income:['income'],expenses:['expenses','recurring'],inventory:['stock','movements','consumption'],
 calculator:['jobs'],investments:['assets','capital'],cash:['cash'],
 settings:['accounts','categories','members','agreements','audit'],
};
export const moduleCopy: Partial<Record<Section,Pair>> = {
 orders:['Track invoices from booking through recognition and collection.','ติดตามใบแจ้งหนี้ตั้งแต่รับคำสั่งซื้อจนถึงรับรู้รายได้และรับเงิน'],
 income:['Record deposits, collections and refunds by account.','บันทึกเงินมัดจำ การรับชำระ และคืนเงินตามบัญชี'],
 expenses:['Record supplier bills, payments and recurring expenses.','บันทึกบิลผู้ขาย การจ่ายเงิน และค่าใช้จ่ายประจำ'],
 inventory:['Track exact usage and cost for each spool.','ติดตามปริมาณใช้และต้นทุนของเส้นพิมพ์แต่ละม้วน'],
 calculator:['Estimate a quote or post actual production figures.','ประเมินราคาเสนอหรือบันทึกต้นทุนการผลิตจริง'],
 profit:['Review recognized revenue and business costs for the selected period.','ดูรายได้ที่รับรู้และต้นทุนธุรกิจตามช่วงเวลา'],
 investments:['Track business funding, withdrawals and equipment book value.','ติดตามเงินทุน การถอนเงิน และมูลค่าตามบัญชีของอุปกรณ์'],
 cash:['Review account balances and record transfers between them.','ดูยอดบัญชีและบันทึกการโอนระหว่างบัญชี'],
 reports:['Download records for the selected period or print a summary.','ดาวน์โหลดข้อมูลตามช่วงเวลาหรือพิมพ์รายงานสรุป'],
};
export function localized(l:L, pair:Pair) {return l(...pair);}
