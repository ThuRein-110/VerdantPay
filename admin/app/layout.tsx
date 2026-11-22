import './globals.css';
import {Preferences} from '@mfu/ui/settings.tsx';
import {translate} from '@mfu/ui/i18n.ts';
import {BOOTSTRAP} from '@mfu/ui/settings-script.ts';
import {preferences} from '@mfu/ui/server-locale.ts';
import type {Metadata} from 'next';

export const metadata:Metadata={
 title:{default:'VerdantPay',template:'%s | VerdantPay'},
 description:'Private financial records and reporting',
 robots:{index:false,follow:false},
};

export default async function Layout({children}:{children:React.ReactNode}){
 const settings=await preferences();
 return <html lang={settings.locale} data-theme={settings.theme} suppressHydrationWarning>
  <head><script dangerouslySetInnerHTML={{__html:BOOTSTRAP}}/></head>
  <body><Preferences {...settings}>
   <a className="skip" href="#main">{translate(settings.locale,'common.skip')}</a>
   <main id="main">{children}</main>
  </Preferences></body>
 </html>;
}
