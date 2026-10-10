/**
 * Server-sent events over `fetch` streaming, wrapped as an RxJS Observable.
 *
 * Why not `EventSource`? The gateway reads the token only from the
 * `Authorization: Bearer` header, and `EventSource` cannot set headers. So we
 * read the response body ourselves and parse the SSE framing.
 *
 * Unsubscribing aborts the request. Errors carry `fatal: true` for 401/403,
 * so callers know not to retry.
 */
import { Observable } from 'rxjs';

export interface SseMessage {
  event: string;
  data: string;
}

export class SseHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SseHttpError';
  }
  /** Bad credentials will not fix themselves: do not retry. */
  get fatal(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

/** Open `url` with a bearer token and emit each SSE message. */
export function sseMessages(
  url: string,
  getToken: () => string,
): Observable<SseMessage> {
  return new Observable<SseMessage>((subscriber) => {
    const abort = new AbortController();

    (async () => {
      const response = await fetch(url, {
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${getToken()}`,
        },
        credentials: 'omit',
        cache: 'no-store',
        signal: abort.signal,
      });
      if (!response.ok || !response.body) {
        // The gateway answers errors as { error: { code, message } }.
        let code = 'HTTP_' + response.status;
        let message = `Event stream refused (HTTP ${response.status})`;
        try {
          const body = (await response.json()) as {
            error?: { code?: string; message?: string };
          };
          code = body.error?.code ?? code;
          message = body.error?.message ?? message;
        } catch {
          // not JSON (e.g. a proxy error page): keep the generic message
        }
        throw new SseHttpError(response.status, code, `${code}: ${message}`);
      }

      const reader = response.body
        .pipeThrough(new TextDecoderStream())
        .getReader();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        buffer += value.replace(/\r\n/g, '\n');
        // A message ends with a blank line.
        let end: number;
        while ((end = buffer.indexOf('\n\n')) !== -1) {
          const message = parseBlock(buffer.slice(0, end));
          buffer = buffer.slice(end + 2);
          if (message) {
            subscriber.next(message);
          }
        }
      }
      // The server closed the stream: treat it as an error so callers reconnect.
      throw new Error('Event stream closed by the server');
    })().catch((error: unknown) => {
      if (!abort.signal.aborted) {
        subscriber.error(error);
      }
    });

    return () => abort.abort();
  });
}

// One SSE block: "event: x" and "data: y" lines; ": comment" lines are keep-alives.
function parseBlock(block: string): SseMessage | null {
  let event = 'message';
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith(':')) {
      continue;
    }
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
    if (field === 'event') {
      event = value;
    } else if (field === 'data') {
      data.push(value);
    }
  }
  return data.length === 0 ? null : { event, data: data.join('\n') };
}
