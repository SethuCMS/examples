/**
 * KEY DESIGN POINT: this file is the only place the gateway token is read.
 * `server-only` makes the build fail if a client component ever imports it,
 * and the env names have no NEXT_PUBLIC_ prefix, so the token cannot reach
 * the browser.
 */
import 'server-only';
import { SethuClient } from '@sethucms/sdk';
import { ConfigError } from './errors';

export interface GatewayConfig {
  baseUrl: string;
  token: string;
}

/** Read SETHUCMS_URL / SETHUCMS_TOKEN from the server environment. */
export function gatewayConfig(): GatewayConfig {
  const baseUrl = process.env.SETHUCMS_URL?.trim();
  const token = process.env.SETHUCMS_TOKEN?.trim();
  if (!baseUrl) {
    throw new ConfigError('SETHUCMS_URL is not set.');
  }
  if (!token) {
    throw new ConfigError('SETHUCMS_TOKEN is not set.');
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ''), token };
}

/** A client for one request. Throws ConfigError when the env is missing. */
export function getClient(): SethuClient {
  const { baseUrl, token } = gatewayConfig();
  return new SethuClient({
    baseUrl,
    token,
    allowInsecureHttp: process.env.SETHUCMS_ALLOW_INSECURE_HTTP === 'true',
  });
}

/** The gateway address (not secret), for display. Null when unset. */
export function gatewayUrl(): string | null {
  return process.env.SETHUCMS_URL?.trim() || null;
}
