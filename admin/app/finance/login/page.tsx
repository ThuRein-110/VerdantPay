import {preferences} from '@mfu/ui/server-locale.ts';
import {redirect} from 'next/navigation';
import {FinanceLogin} from './screen';
import {financeAccess,financeDestination,isApproved} from '../membership';
import {canRecover} from '../auth/flow';
import '../finance.css';

export const metadata={title:'Sign In',robots:{index:false,follow:false}};
export default async function FinanceLoginPage({searchParams}:{searchParams:Promise<{reset?:string}>}) {
 const [{locale},access,query]=await Promise.all([preferences(),financeAccess(),searchParams]);
 const destination=financeDestination(access);
 if(access&&await canRecover(access.claims.session_id))redirect('/finance/reset-password');
 if(access&&destination!=='/finance/login')redirect(destination);
 return <FinanceLogin thai={locale==='th'} initialMfa={!!access&&isApproved(access.role)} result={query.reset==='1'?'reset':undefined}/>;
}
