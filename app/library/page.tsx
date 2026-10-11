import type {Metadata} from 'next';
import Library from './library';
export const metadata:Metadata={title:'Public quiz library | QuizMint',description:'Explore creator-shared quizzes and reuse a copy in your own teaching space, without AI credits.'};
export default function Page(){return <Library/>;}
