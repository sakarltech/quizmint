import {aiUser} from '../../../../lib/ai-server';
import {body,response,sameOrigin} from '../../../../lib/server';
import {queueTicket} from '../../../../lib/platform-controls';
import {throttle} from '../../../../lib/accounts';
export async function POST(req:Request){if(!sameOrigin(req))return response({error:'Invalid origin.'},403);const user=await aiUser(req);if(!user)return response({error:'Sign in required.'},401);try{if(!await throttle('queue:'+user.id,300))return response({error:'Please wait before checking the queue again.'},429);const x=await body(req);if(typeof x.requestId!=='string'||!/^[a-f0-9-]{36}$/.test(x.requestId))throw Error('Invalid request.');return response(await queueTicket(user.id,x.requestId));}catch(e){return response({error:(e as Error).message},409);}}
