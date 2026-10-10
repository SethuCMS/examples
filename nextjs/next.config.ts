/**
 * Next.js config. Demonstrates consuming the SethuCMS SDK as a local
 * `file:` dependency: it is an ES module outside this folder, so Next is told
 * to compile it together with the app (transpilePackages).
 */
import type { NextConfig } from 'next';
import path from 'node:path';

const config: NextConfig = {
  // Do not let Next write AGENTS.md / CLAUDE.md into this example.
  agentRules: false,
  transpilePackages: ['@sethucms/sdk'],
  // The SDK lives two folders up (symlinked by `file:`); let the bundler read it.
  turbopack: { root: path.resolve(__dirname, '../..') },
};

export default config;
