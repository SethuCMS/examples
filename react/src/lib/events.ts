/**
 * Live change stream (Server-Sent Events) over fetch.
 *
 * The gateway protects GET /v1/events with the same bearer token as the rest
 * of the API. The browser's EventSource cannot send an Authorization header,
 * so this reads the stream with fetch() and parses the SSE text format by
 * hand. It reconnects with a short delay if the stream drops.
 */

/** One decoded SSE message. */
export interface StreamEvent {
  /** The SSE `event:` name, e.g. "ready", "record.created". */
  type: string;
  /** Parsed `data:` JSON (or the raw text if it was not JSON). */
  data: unknown;
}

/** Connection state reported to the UI. */
export type StreamStatus = 'connecting' | 'open' | 'reconnecting' | 'error';

/** Callbacks and settings for {@link streamEvents}. */
export interface StreamOptions {
  baseUrl: string;
  token: string;
  signal: AbortSignal;
  onEvent(event: StreamEvent): void;
  onStatus(status: StreamStatus, detail?: string): void;
}

/**
 * Open the stream and keep it open until `signal` aborts. Resolves when
 * aborted. A 401/403 stops retrying (a new token is needed); other failures
 * retry after 3 seconds.
 */
export async function streamEvents(options: StreamOptions): Promise<void> {
  const { baseUrl, token, signal, onEvent, onStatus } = options;
  let first = true;
  while (!signal.aborted) {
    onStatus(first ? 'connecting' : 'reconnecting');
    first = false;
    try {
      const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/v1/events`, {
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${token}`,
        },
        credentials: 'omit',
        signal,
      });
      if (response.status === 401 || response.status === 403) {
        onStatus('error', `HTTP ${response.status}: the token was refused`);
        return;
      }
      if (!response.ok || !response.body) {
        onStatus('error', `HTTP ${response.status}`);
      } else {
        onStatus('open');
        await readSse(response.body, onEvent);
      }
    } catch (error) {
      if (signal.aborted) return;
      onStatus('error', error instanceof Error ? error.message : String(error));
    }
    await delay(3000, signal);
  }
}

// Read SSE frames ("event: x\ndata: y\n\n") until the body ends.
async function readSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    let end: number;
    while ((end = buffer.search(/\r?\n\r?\n/)) !== -1) {
      const frame = buffer.slice(0, end);
      buffer = buffer.slice(end).replace(/^\r?\n\r?\n/, '');
      const parsed = parseFrame(frame);
      if (parsed) onEvent(parsed);
    }
  }
}

// One frame -> event. Comment lines (": keep-alive") and "retry:" are ignored.
function parseFrame(frame: string): StreamEvent | null {
  let type = 'message';
  const data: string[] = [];
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith('event:')) type = line.slice(6).trim();
    else if (line.startsWith('data:'))
      data.push(line.slice(5).replace(/^ /, ''));
  }
  if (data.length === 0) return null;
  const text = data.join('\n');
  try {
    return { type, data: JSON.parse(text) as unknown };
  } catch {
    return { type, data: text };
  }
}

// Abortable wait.
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}
