/**
 * Demonstrates proxying the live change stream. The browser opens an
 * EventSource on THIS origin (/api/events); this handler opens the gateway's
 * /v1/events with the bearer token (server side only) and pipes the bytes
 * through. The token and gateway address never reach the browser.
 *
 * Optional: /api/events?connection=<id> shows one connection only.
 * Note: this test app has no login of its own, so anyone who can open it can
 * watch this feed. Do not expose it publicly as is.
 */
import { toErrorInfo } from '@/lib/errors';
import { gatewayConfig, getClient } from '@/lib/sethu';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const fail = (error: ReturnType<typeof toErrorInfo>, status: number) =>
  Response.json({ error }, { status });

export async function GET(request: Request) {
  let target: URL;
  let token: string;
  try {
    getClient(); // validates the URL rules (https, or http for localhost)
    const cfg = gatewayConfig();
    token = cfg.token;
    target = new URL(`${cfg.baseUrl}/v1/events`);
  } catch (e) {
    return fail(toErrorInfo(e), 500);
  }
  const only = new URL(request.url).searchParams.get('connection');
  if (only) target.searchParams.set('connection', only);

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'text/event-stream',
      },
      // Closing the browser tab aborts the gateway stream too.
      signal: request.signal,
      cache: 'no-store',
    });
  } catch (e) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    return fail(
      {
        ...toErrorInfo(e),
        code: 'CONNECTION_FAILED',
        message: 'Could not reach the gateway',
      },
      502,
    );
  }

  if (!upstream.ok || !upstream.body) {
    // Pass the gateway's error code through (AUTH_FAILED, RATE_LIMITED ...).
    const body = (await upstream.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    return fail(
      {
        code: body?.error?.code ?? 'INTERNAL',
        message: body?.error?.message ?? `Gateway answered ${upstream.status}`,
        status: upstream.status,
      },
      upstream.status || 502,
    );
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
