import type {Metadata} from 'next';
import ResetPassword from './reset-password';
export const metadata:Metadata={title:'Choose a new password | QuizMint',robots:{index:false,follow:false},referrer:'no-referrer'};
export default function Page(){return <ResetPassword/>;}
