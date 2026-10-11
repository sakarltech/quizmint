import type { Metadata } from 'next';
import './globals.css';
import './colour-refresh.css';
import Minty from '../components/minty';
export const metadata:Metadata={title:'QuizMint · Drop a topic. Mint a quiz.',description:'Create AI quizzes from topics, documents and recordings. Share, score and learn with QuizMint.',icons:{icon:{url:'/quizmint-emblem-icon.png',type:'image/png',sizes:'64x64'},apple:{url:'/quizmint-emblem-apple.png',sizes:'180x180',type:'image/png'}}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}<Minty/></body></html>}
