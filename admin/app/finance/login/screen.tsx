'use client';

import {useRouter} from 'next/navigation';
import {Auth} from '@mfu/ui/workflows.tsx';
import {BrandMark,ThemeButton} from '../chrome';

export function FinanceLogin({thai}:{thai:boolean}) {
 const router=useRouter();
 return <div className="finance finance-login">
  <div className="finance-login-toolbar"><ThemeButton thai={thai}/></div>
  <div className="finance-login-inner">
   <div className="finance-login-brand">
    <BrandMark/>
    <strong>Memo Finance</strong>
    <p>{thai?'พื้นที่การเงินของธุรกิจ':'Your private business workspace'}</p>
   </div>
   <Auth admin compact onAuthenticated={()=>{router.replace('/finance');router.refresh();}}/>
  </div>
 </div>;
}
