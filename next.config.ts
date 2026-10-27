import type { NextConfig } from 'next';
import path from 'node:path';
const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: { cpus: 1 },
  webpack(config, { webpack }) {
    // The namecheap commands explicitly select webpack. Replace the Workers
    // scheme before module loading, keeping legacy Vinext builds unchanged.
    config.plugins.push(new webpack.NormalModuleReplacementPlugin(/^cloudflare:workers$/, path.resolve(process.cwd(), 'lib/runtime-namecheap.ts')));
    return config;
  },
};
export default nextConfig;
