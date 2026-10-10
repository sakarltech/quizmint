import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Classroom Quiz · A little curiosity, a lot of learning',description:'Share a quiz, get instant feedback and see what your class understands.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
