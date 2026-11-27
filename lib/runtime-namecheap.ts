// Next.js server build replacement for the Workers binding module. Values are
// read at request time, never embedded into a client bundle via nextConfig.env.
export const env: any = new Proxy(Object.create(null), {
  get(_target, key) {
    if (key === 'QUIZMINT_RUNTIME') return 'namecheap';
    if (key === 'DB' || key === 'BUCKET') return undefined;
    return typeof key === 'string' ? process.env[key] : undefined;
  },
});
