export const notificationLabels={
 income:['New income','รายรับใหม่'],expense:['New expense','ค่าใช้จ่ายใหม่'],investment:['Investment records','รายการลงทุน'],
 payout:['Team payouts','จ่ายส่วนแบ่งทีม'],daily:['Daily summary','สรุปรายวัน'],weekly:['Weekly summary','สรุปรายสัปดาห์'],
 monthly:['Monthly profit report','รายงานกำไรรายเดือน'],yearly:['Yearly profit report','รายงานกำไรรายปี'],
} as const;
export type NotificationKind=keyof typeof notificationLabels;
export type EmailState={
 email:string|null;verified_at:string|null;enabled:boolean;kinds:NotificationKind[];paused_until:string|null;
 history:{id:string;kind:NotificationKind|'verify'|'test';state:'pending'|'sent'|'failed';queued_at:string;sent_at:string|null;attempts:number;failure:string|null}[];
};
export type EmailAction='request'|'verify'|'save'|'test';
export type EmailResult='saved'|'queued'|'verified'|'invalid'|'unavailable'|'rate'|'unverified'|'wrong_code'|'auth';
