/**
 * Small helpers shared by the panels: building the SDK client, turning errors
 * into something readable, and sessionStorage access that never throws.
 */
import { SethuApiError, SethuClient } from '@sethucms/sdk';

/** Default gateway address (what `scripts/run-local.sh` listens on). */
export const DEFAULT_GATEWAY_URL = 'http://127.0.0.1:8080';

/**
 * Turn what the user typed into an absolute URL. A value such as "/api" is
 * resolved against this page, which is how the Vite dev proxy is used.
 */
export function resolveBaseUrl(raw: string): string {
  const value = raw.trim();
  return value.startsWith('/') ? `${window.location.origin}${value}` : value;
}

/**
 * Build an SDK client. Retries are off so a wrong address fails immediately
 * instead of after several backoff delays. Throws TypeError for a bad URL.
 */
export function makeClient(url: string, token: string): SethuClient {
  return new SethuClient({
    baseUrl: resolveBaseUrl(url),
    token,
    maxRetries: 0,
    timeoutMs: 10_000,
  });
}

/** What an error looks like on screen. */
export interface ShownError {
  code: string;
  message: string;
  status?: number;
  requestId?: string;
  details?: unknown;
}

/** Convert anything thrown into a {@link ShownError}. SethuApiError keeps its code. */
export function describeError(error: unknown): ShownError {
  if (error instanceof SethuApiError) {
    return {
      code: error.code,
      message: error.message,
      status: error.status,
      ...(error.requestId ? { requestId: error.requestId } : {}),
      ...(error.details !== undefined ? { details: error.details } : {}),
    };
  }
  if (error instanceof Error) {
    return { code: error.name, message: error.message };
  }
  return { code: 'ERROR', message: String(error) };
}

/** One-line version of an error, used in the self-check results. */
export function errorLine(error: unknown): string {
  const e = describeError(error);
  return `${e.code}${e.status ? ` (HTTP ${e.status})` : ''}: ${e.message}`;
}

/** Read a sessionStorage value; returns '' when storage is unavailable. */
export function readSession(key: string): string {
  try {
    return window.sessionStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

/** Write a sessionStorage value, ignoring storage errors (private mode etc.). */
export function writeSession(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Storage is optional: the value still lives in React state.
  }
}
