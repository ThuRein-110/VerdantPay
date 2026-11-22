import {financeAdmin} from '../data';
import {EmailPanel} from './panel';
import type {EmailState} from './types';

export async function EmailSettings({thai}:{thai:boolean}) {
 const db=await financeAdmin();
 const {data,error}=await db.rpc('finance_email_status' as never);
 if(error||!data)return <section className="finance-panel"><h2>{thai?'การแจ้งเตือนทางอีเมล':'Email Notifications'}</h2>
  <p className="finance-muted">{thai?'โหลดการตั้งค่าอีเมลไม่ได้':'Email preferences are unavailable.'}</p></section>;
 return <EmailPanel state={data as unknown as EmailState} thai={thai}/>;
}
