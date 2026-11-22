import {tables} from './sections';
export const reports = {
 daily:['Daily sales','ยอดขายรายวัน'],
 monthly:['Monthly sales','ยอดขายรายเดือน'],
 profit:['Monthly profit and loss','กำไรขาดทุนรายเดือน'],
 cash:['Cash flow','กระแสเงินสด'],
 stock:['Material inventory','คลังวัสดุ'],
 consumption:['Material consumption','การใช้วัสดุ'],
 profitability:['Order profitability','กำไรต่อคำสั่งซื้อ'],
 investments:['Equipment and investments','อุปกรณ์และเงินลงทุน'],
 team:['Team payout statements','รายงานจ่ายส่วนแบ่งทีม'],
 yearly:['Yearly summary','สรุปรายปี'],
} as const;
export type Report = keyof typeof reports;
export const reportTables = {
 cash:[tables.cash],stock:[tables.stock],consumption:[tables.consumption],profitability:[tables.profitability],
 investments:[tables.assets,tables.capital],team:[tables.allocations,tables.payouts],
} as const;
