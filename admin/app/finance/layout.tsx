import type {Metadata,Viewport} from 'next';
import memoLogo from '../../../mainlogo.png';
export const metadata:Metadata={icons:{icon:memoLogo.src}};
export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover'};
export default function FinanceLayout({children}:{children:React.ReactNode}) {return children;}
