import {aiStore} from '../../../lib/ai-store';
import {aiAvailability} from '../../../lib/platform-controls';
import {aiUser,wallet,settings} from '../../../lib/ai-server';
import {response} from '../../../lib/server';
import {freeAllowancePeriod,FREE_QUESTION_LIMIT} from '../../../lib/free-allowance';
import {plans} from '../../../lib/ai-plans';
export const dynamic='force-dynamic';
export async function GET(req:Request){const u=await aiUser(req);if(!u)return response({error:'Creator sign-in required.'},401);const w=await wallet(u.id);const available=await aiAvailability();if(new URL(req.url).searchParams.has('latest')){const latest:any=await (await aiStore()).latest(u.id);return response({quiz:latest?JSON.parse(latest.result):null});}return response({freeRemaining:w.free_remaining,freeLimit:FREE_QUESTION_LIMIT,freeResetsAt:freeAllowancePeriod().resetsAt,credits:w.credits,adminFree:u.id.startsWith('admin:'),unlimited:u.id.startsWith('admin:')||w.subscription_end>Date.now(),subscriptionEnd:w.subscription_end,hasCustomer:!!w.customer,aiEnabled:!!settings().OPENAI_API_KEY,aiAvailable:available,checkoutEnabled:available,billingEnabled:!!(settings().OPENAI_API_KEY&&settings().STRIPE_SECRET_KEY&&settings().STRIPE_WEBHOOK_SECRET),plans});}
