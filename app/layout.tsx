import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'QuizMint · Drop a topic. Mint a quiz.',description:'Create AI quizzes from topics, documents and recordings. Share, score and learn with QuizMint.',icons:{icon:'/quizmint-mark.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
