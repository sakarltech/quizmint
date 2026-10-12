import type {Metadata} from 'next';
import ForgotPassword from './forgot-password';
export const metadata:Metadata={title:'Forgot password | QuizMint',robots:{index:false,follow:false},referrer:'no-referrer'};
export default function Page(){return <ForgotPassword/>;}
