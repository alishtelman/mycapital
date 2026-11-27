import type {Metadata,Viewport} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Tenge — личные финансы',description:'Семейный бюджет и план накопления на квартиру',manifest:'/manifest.webmanifest'};
export const viewport:Viewport={themeColor:'#101d19'};
export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="ru"><body>{children}</body></html>;
}
