import type {Metadata} from 'next';
import Pricing from './pricing';
export const metadata:Metadata={title:'Pricing | QuizMint',description:'Start with 20 free AI questions every month. Choose question credits, unlimited monthly AI for £9.99 or annual AI for £95.90.'};
export default function PricingPage(){return <Pricing/>;}
