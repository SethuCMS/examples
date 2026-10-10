/**
 * SethuService: the Angular wrapper around @sethucms/sdk.
 *
 * Shows how to use the SDK from Angular:
 *  - one `SethuClient` built from signals (gateway URL + token); the token is
 *    passed as a function, so a changed token is picked up on the next call;
 *  - SDK promises stay promises; state (health, connections, collections,
 *    selection) is exposed as read-only signals;
 *  - the live feed (/v1/events) is an RxJS Observable over fetch streaming
 *    (the SDK has no events API), with retry and signals for status;
 *  - `describeError()` turns SethuApiError into text for the UI.
 *
 * The token lives in memory and sessionStorage only, never localStorage.
 */
import { Injectable, computed, signal } from '@angular/core';
import { retry, throwError, timer, type Subscription } from 'rxjs';
import {
  SethuClient,
  isSethuApiError,
  type Collection,
  type CollectionInfo,
  type ConnectionInfo,
} from '@sethucms/sdk';
import { SseHttpError, sseMessages } from './util/sse';

export const DEFAULT_GATEWAY_URL = 'http://127.0.0.1:8080';
const STORAGE_KEY = 'sethucms-angular-example.settings';
const HEALTH_POLL_MS = 15_000;
const MAX_FEED = 50;

export type Health = 'unknown' | 'checking' | 'ok' | 'down';
export type StreamState = 'off' | 'connecting' | 'live' | 'error';

/** One change notification from /v1/events (ids only, never field values). */
export interface FeedItem {
  n: number;
  at: Date;
  type: string;
  connectionId?: string;
  collection?: string;
  recordId?: string;
}

/** Turn any error into one readable line; SethuApiError shows code + message. */
export function describeError(error: unknown): string {
  if (isSethuApiError(error)) {
    const where = error.status ? `HTTP ${error.status}` : 'no response';
    const id = error.requestId ? `, request ${error.requestId}` : '';
    return `${error.code}: ${error.message} (${where}${id})`;
  }
  return error instanceof Error ? error.message : String(error);
}

@Injectable({ providedIn: 'root' })
export class SethuService {
  // ---- Settings (in memory + sessionStorage) -------------------------
  readonly baseUrl = signal(DEFAULT_GATEWAY_URL);
  readonly token = signal('');

  // ---- Server state --------------------------------------------------
  readonly health = signal<Health>('unknown');
  /** Why connecting failed (bad token, unreachable...), or null. */
  readonly connectError = signal<string | null>(null);
  readonly connections = signal<ConnectionInfo[]>([]);
  readonly collections = signal<CollectionInfo[]>([]);
  readonly connectionId = signal<string | null>(null);
  readonly collectionName = signal<string | null>(null);
  readonly loading = signal(false);

  readonly connection = computed(
    () => this.connections().find((c) => c.id === this.connectionId()) ?? null,
  );
  readonly collection = computed(
    () =>
      this.collections().find((c) => c.name === this.collectionName()) ?? null,
  );
  /** True for read_only connections: the UI must not offer writes. */
  readonly readOnly = computed(() => this.connection()?.mode === 'read_only');

  // ---- Live feed -----------------------------------------------------
  readonly stream = signal<StreamState>('off');
  readonly streamMessage = signal<string | null>(null);
  readonly feed = signal<FeedItem[]>([]);
  /** The newest event; components react to it with effect(). */
  readonly lastEvent = signal<FeedItem | null>(null);

  private streamSub: Subscription | undefined;
  private feedCounter = 0;

  /** Rebuilt whenever the URL changes; null if the URL is invalid. */
  private readonly client = computed(() => {
    try {
      return new SethuClient({
        baseUrl: this.baseUrl().trim(),
        // A function: read at request time, so token edits apply immediately.
        token: () => this.token(),
      });
    } catch {
      return null;
    }
  });

  constructor() {
    this.restoreSettings();
    setInterval(() => {
      if (this.health() !== 'checking') {
        void this.checkHealth();
      }
    }, HEALTH_POLL_MS);
    if (this.token()) {
      void this.connect();
    } else {
      void this.checkHealth();
    }
  }

  /** The SDK client (throws a readable Error when the URL is invalid). */
  sdk(): SethuClient {
    const client = this.client();
    if (!client) {
      throw new Error(
        'The gateway URL is not valid (example: http://127.0.0.1:8080)',
      );
    }
    return client;
  }

  /** A typed handle on one collection, straight from the SDK. */
  handle(connectionId: string, name: string): Collection {
    return this.sdk().collection(connectionId, name);
  }

  // ---- Settings ------------------------------------------------------

  /** Save settings, check health, load connections, start the live feed. */
  async connect(): Promise<void> {
    this.persistSettings();
    this.stopStream();
    this.connectError.set(null);
    await this.checkHealth();
    if (this.health() !== 'ok') {
      this.connections.set([]);
      this.collections.set([]);
      this.connectionId.set(null);
      this.collectionName.set(null);
      this.connectError.set(
        'Cannot reach the gateway. Check the URL, that it is running, and CORS (see README).',
      );
      return;
    }
    await this.loadConnections();
    if (!this.connectError()) {
      this.startStream();
    }
  }

  async checkHealth(): Promise<void> {
    const client = this.client();
    if (!client) {
      this.health.set('down');
      return;
    }
    this.health.set('checking');
    this.health.set((await client.isHealthy()) ? 'ok' : 'down');
  }

  // ---- Connections and collections ---------------------------------

  async loadConnections(): Promise<void> {
    this.loading.set(true);
    try {
      const list = await this.sdk().connections();
      this.connections.set(list);
      const keep = list.find((c) => c.id === this.connectionId());
      await this.selectConnection(keep?.id ?? list[0]?.id ?? null);
    } catch (error) {
      this.connections.set([]);
      this.connectError.set(describeError(error));
    } finally {
      this.loading.set(false);
    }
  }

  async selectConnection(id: string | null): Promise<void> {
    this.connectionId.set(id);
    this.collections.set([]);
    this.collectionName.set(null);
    if (!id) {
      return;
    }
    try {
      const list = await this.sdk().collections(id);
      if (this.connectionId() !== id) {
        return; // the user picked another connection meanwhile
      }
      this.collections.set(list);
      this.collectionName.set(list[0]?.name ?? null);
    } catch (error) {
      this.connectError.set(describeError(error));
    }
  }

  selectCollection(name: string | null): void {
    this.collectionName.set(name);
  }

  // ---- Live feed (SSE) -----------------------------------------------

  startStream(): void {
    this.stopStream();
    if (!this.token()) {
      return;
    }
    const url = this.baseUrl().trim().replace(/\/+$/, '') + '/v1/events';
    this.stream.set('connecting');
    this.streamSub = sseMessages(url, () => this.token())
      .pipe(
        retry({
          resetOnSuccess: true,
          delay: (error, attempt) => {
            if (error instanceof SseHttpError && error.fatal) {
              return throwError(() => error); // 401/403: stop, the token must change
            }
            this.stream.set('error');
            this.streamMessage.set(
              `${describeError(error)}. Retrying (attempt ${attempt})...`,
            );
            return timer(Math.min(1000 * 2 ** (attempt - 1), 10_000));
          },
        }),
      )
      .subscribe({
        next: (message) => this.onStreamMessage(message.event, message.data),
        error: (error: unknown) => {
          this.stream.set('error');
          this.streamMessage.set(describeError(error));
        },
      });
  }

  stopStream(): void {
    this.streamSub?.unsubscribe();
    this.streamSub = undefined;
    this.stream.set('off');
    this.streamMessage.set(null);
  }

  clearFeed(): void {
    this.feed.set([]);
  }

  private onStreamMessage(event: string, data: string): void {
    if (event === 'ready') {
      this.stream.set('live');
      this.streamMessage.set(null);
      return;
    }
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(data) as Record<string, unknown>;
    } catch {
      // keep the event with no details
    }
    const text = (key: string): string | undefined =>
      typeof payload[key] === 'string' ? (payload[key] as string) : undefined;
    const item: FeedItem = {
      n: ++this.feedCounter,
      at: new Date(),
      type: event,
    };
    const connectionId = text('connectionId');
    const collection = text('collection');
    const recordId = text('recordId');
    if (connectionId) item.connectionId = connectionId;
    if (collection) item.collection = collection;
    if (recordId) item.recordId = recordId;
    this.feed.update((list) => [item, ...list].slice(0, MAX_FEED));
    this.lastEvent.set(item);
  }

  // ---- Settings storage ----------------------------------------------

  private restoreSettings(): void {
    try {
      const saved = JSON.parse(
        sessionStorage.getItem(STORAGE_KEY) ?? 'null',
      ) as { baseUrl?: string; token?: string } | null;
      if (saved?.baseUrl) this.baseUrl.set(saved.baseUrl);
      if (saved?.token) this.token.set(saved.token);
    } catch {
      // sessionStorage can be blocked: run with memory only
    }
  }

  private persistSettings(): void {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ baseUrl: this.baseUrl(), token: this.token() }),
      );
    } catch {
      // ignore: settings stay in memory
    }
  }
}
