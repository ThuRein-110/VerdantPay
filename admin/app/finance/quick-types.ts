export const quickTypes = {
 income:['Income','รายรับ'],
 expense:['Expense','ค่าใช้จ่าย'],
 investment:['Investment','เงินลงทุน'],
 payout:['Payout','จ่ายส่วนแบ่ง'],
} as const;
export type QuickType = keyof typeof quickTypes;
