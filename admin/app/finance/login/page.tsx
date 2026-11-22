import {preferences} from '@mfu/ui/server-locale.ts';
import {FinanceLogin} from './screen';
import '../finance.css';

export const metadata={title:'Memo Finance Sign In',robots:{index:false,follow:false}};
export default async function FinanceLoginPage() {
 const {locale}=await preferences();
 return <FinanceLogin thai={locale==='th'}/>;
}
