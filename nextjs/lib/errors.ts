/**
 * Demonstrates turning any thrown value into plain, serialisable error data
 * (SethuApiError code + message, with a hint) so it can be shown in the UI and
 * passed to client components without leaking anything else.
 */

/** Thrown when .env.local is missing or wrong. */
export class ConfigError extends Error {
  override name = 'ConfigError';
}

/** What the UI shows for a failure. Plain data only. */
export interface ErrorInfo {
  code: string;
  message: string;
  status?: number;
  requestId?: string;
  details?: string;
  hint?: string;
}

const HINTS: Record<string, string> = {
  CONFIG:
    'Create .env.local from .env.local.example, then restart `npm run dev`.',
  AUTH_FAILED:
    'The gateway rejected the token. Check SETHUCMS_TOKEN in .env.local and restart the dev server.',
  FORBIDDEN: 'This token is not allowed to do that (its role is too low).',
  READ_ONLY:
    'This connection is read-only. Switch it to read_write in the SethuCMS admin app to allow changes.',
  NOT_FOUND: 'That connection, collection or record does not exist.',
  VALIDATION_FAILED: 'The gateway refused the values. Fix them and try again.',
  CONNECTION_FAILED:
    'Could not reach the gateway. Is it running, and is SETHUCMS_URL correct?',
  TIMEOUT: 'The gateway took too long to answer.',
  RATE_LIMITED: 'Too many requests. Wait a moment and retry.',
  CAPABILITY_UNSUPPORTED: 'This database cannot do that (see the notes shown).',
};

// Duck-typed on purpose: the SDK may be loaded as more than one module copy
// by the bundler, which would break `instanceof`.
function isApiError(e: unknown): e is {
  code: string;
  message: string;
  status: number;
  requestId?: string;
  details?: unknown;
} {
  return (
    typeof e === 'object' &&
    e !== null &&
    (e as { name?: unknown }).name === 'SethuApiError' &&
    typeof (e as { code?: unknown }).code === 'string'
  );
}

/** Convert anything thrown into {@link ErrorInfo}. */
export function toErrorInfo(e: unknown): ErrorInfo {
  if (isApiError(e)) {
    let details: string | undefined;
    if (e.details !== undefined && e.details !== null) {
      try {
        details = JSON.stringify(e.details, null, 2).slice(0, 800);
      } catch {
        details = undefined;
      }
    }
    return {
      code: e.code,
      message: e.message,
      status: e.status,
      ...(e.requestId ? { requestId: e.requestId } : {}),
      ...(details ? { details } : {}),
      ...(HINTS[e.code] ? { hint: HINTS[e.code] } : {}),
    };
  }
  if (e instanceof ConfigError) {
    return {
      code: 'CONFIG',
      message: e.message,
      hint: HINTS['CONFIG'] as string,
    };
  }
  // E.g. the SDK's TypeError for a bad baseUrl.
  const message = e instanceof Error ? e.message : 'Unexpected error';
  return { code: 'ERROR', message };
}
