import {AsyncLocalStorage} from 'node:async_hooks';
type RuntimeContext={waitUntil(promise:Promise<unknown>):void};
const key=Symbol.for('quizmint.runtime-context');
const state=globalThis as typeof globalThis & {[key]?:AsyncLocalStorage<RuntimeContext>};
const contexts=state[key]??(state[key]=new AsyncLocalStorage<RuntimeContext>());
export function withRuntimeContext<T>(context:RuntimeContext,run:()=>T){return contexts.run(context,run);}
export async function runInBackground(task:Promise<unknown>){const context=contexts.getStore();if(context)context.waitUntil(task);else await task;}
