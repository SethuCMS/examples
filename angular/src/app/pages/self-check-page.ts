/**
 * Self-check: runs the whole SDK happy path against the gateway and shows
 * pass / fail / skip for each step:
 *   health, list connections, list collections, list records, create a scratch
 *   record (writable connection only), read it, update it, delete it, and
 *   confirm it is gone (NOT_FOUND).
 * Demonstrates the SDK end to end and SethuApiError handling.
 */
import { Component, inject, signal } from '@angular/core';
import {
  SethuApiError,
  type CollectionInfo,
  type ConnectionInfo,
  type RecordData,
} from '@sethucms/sdk';
import { SethuService, describeError } from '../sethu.service';
import { kindOf, primaryKeyOf, type FieldInfo } from '../util/fields';

type Status = 'pending' | 'running' | 'pass' | 'fail' | 'skip';

interface Step {
  name: string;
  status: Status;
  detail: string;
}

const STEP_NAMES = [
  'Health',
  'List connections',
  'List collections',
  'List records',
  'Create scratch record',
  'Read record',
  'Update record',
  'Delete record',
  'Record is gone',
];

interface Pair {
  connection: ConnectionInfo;
  collection: CollectionInfo;
}

// A throw with this type marks a step as skipped, not failed.
class Skip extends Error {}

@Component({
  selector: 'app-self-check-page',
  template: `
    <section class="panel" aria-label="Self-check">
      <div class="row between">
        <h2>Self-check</h2>
        <button
          type="button"
          class="primary"
          data-testid="run-self-check"
          [disabled]="running()"
          (click)="run()"
        >
          {{ running() ? 'Running...' : 'Run self-check' }}
        </button>
      </div>
      <p class="muted">
        Uses the gateway URL and token from the settings bar. Writes only to a
        scratch record that it deletes again.
      </p>

      @if (summary(); as text) {
        <p data-testid="summary" [class]="allPassed() ? 'ok' : 'error'">
          {{ text }}
        </p>
      }

      <ol class="steps" data-testid="steps">
        @for (s of steps(); track s.name) {
          <li [attr.data-status]="s.status" data-testid="step">
            <span class="status" [class]="'status ' + s.status">{{
              label(s.status)
            }}</span>
            <strong>{{ s.name }}</strong>
            <span class="muted">{{ s.detail }}</span>
          </li>
        }
      </ol>
    </section>
  `,
})
export class SelfCheckPage {
  private readonly svc = inject(SethuService);

  protected readonly running = signal(false);
  protected readonly steps = signal<Step[]>(
    STEP_NAMES.map((name) => ({ name, status: 'pending', detail: '' })),
  );
  protected readonly summary = signal<string | null>(null);
  protected readonly allPassed = signal(false);

  protected label(status: Status): string {
    return status.toUpperCase();
  }

  protected async run(): Promise<void> {
    this.running.set(true);
    this.summary.set(null);
    this.steps.set(
      STEP_NAMES.map((name) => ({ name, status: 'pending', detail: '' })),
    );
    try {
      await this.sequence();
    } finally {
      const list = this.steps();
      const failed = list.filter((s) => s.status === 'fail').length;
      const skipped = list.filter((s) => s.status === 'skip').length;
      const passed = list.filter((s) => s.status === 'pass').length;
      this.allPassed.set(
        failed === 0 && list.every((s) => s.status !== 'pending'),
      );
      this.summary.set(
        `${passed} passed, ${failed} failed, ${skipped} skipped` +
          (failed ? ' - later steps depend on earlier ones.' : '.'),
      );
      this.running.set(false);
    }
  }

  // Runs each step in order; a failed step stops the chain, because the
  // later steps need what it produced.
  private async sequence(): Promise<void> {
    const sdk = this.svc.sdk();
    let connections: ConnectionInfo[] = [];
    // Filled by step 2: where to read, and where (if anywhere) to write.
    const found: { read?: Pair; write?: Pair } = {};
    let created: RecordData | undefined;
    let id = '';
    let updateField = '';
    let updatedValue = '';

    const ok = await this.step(0, async () => {
      if (!(await sdk.isHealthy())) {
        throw new Error('GET /v1/health did not answer OK');
      }
      return 'gateway is ready';
    });
    if (!ok) return;

    if (
      !(await this.step(1, async () => {
        connections = await sdk.connections();
        if (connections.length === 0) {
          throw new Error('No connections visible to this token');
        }
        return connections.map((c) => `${c.name} (${c.mode})`).join(', ');
      }))
    ) {
      return;
    }

    if (
      !(await this.step(2, async () => {
        // Prefer the connection selected in the Records page.
        const ordered = [
          ...connections.filter((c) => c.id === this.svc.connectionId()),
          ...connections.filter((c) => c.id !== this.svc.connectionId()),
        ];
        for (const connection of ordered) {
          const collections = await sdk.collections(connection.id);
          const first =
            collections.find((c) => c.name === this.svc.collectionName()) ??
            collections[0];
          if (first && !found.read) {
            found.read = { connection, collection: first };
          }
          if (connection.mode !== 'read_write') {
            continue;
          }
          const candidate =
            collections.find(
              (c) =>
                c.name === this.svc.collectionName() && scratchValues(c, 'x'),
            ) ?? collections.find((c) => scratchValues(c, 'x'));
          if (candidate) {
            found.write = { connection, collection: candidate };
            break;
          }
        }
        const shown = found.write ?? found.read;
        if (!shown) {
          throw new Error('No collections visible on any connection');
        }
        return `using ${shown.connection.name} / ${shown.collection.name}`;
      }))
    ) {
      return;
    }

    const readTarget = (found.write ?? found.read)!;
    if (
      !(await this.step(3, async () => {
        const page = await this.svc
          .handle(readTarget.connection.id, readTarget.collection.name)
          .query()
          .limit(5)
          .list();
        return `${readTarget.collection.name}: ${page.data.length} record(s) on first page`;
      }))
    ) {
      return;
    }

    const writeTarget = found.write;
    if (!writeTarget) {
      const why = 'no writable connection with a fillable collection';
      for (let i = 4; i <= 8; i++) this.set(i, 'skip', why);
      return;
    }
    const handle = this.svc.handle(
      writeTarget.connection.id,
      writeTarget.collection.name,
    );
    const where = `${writeTarget.connection.name}/${writeTarget.collection.name}`;
    const pk = primaryKeyOf(writeTarget.collection.fields);

    if (
      !(await this.step(4, async () => {
        const stamp = String(Date.now());
        const values = scratchValues(writeTarget.collection, stamp)!;
        updateField =
          writeTarget.collection.fields.find(
            (f) =>
              !f.primaryKey &&
              typeof values[f.name] === 'string' &&
              kindOf(f.type) !== 'date' &&
              kindOf(f.type) !== 'datetime',
          )?.name ?? '';
        created = await handle.create(values);
        id = String(created[pk] ?? '');
        if (!id) {
          throw new Error(`Created, but the response has no "${pk}"`);
        }
        return `${where} #${id}`;
      }))
    ) {
      return;
    }

    const cleanup = async (): Promise<void> => {
      try {
        await handle.delete(id);
      } catch {
        // best effort: the failed step already explains the problem
      }
    };

    if (
      !(await this.step(5, async () => {
        const record = await handle.get(id);
        if (String(record[pk]) !== id) {
          throw new Error('The record read back has a different id');
        }
        return `got #${id}`;
      }))
    ) {
      await cleanup();
      return;
    }

    if (
      !(await this.step(6, async () => {
        if (!updateField) {
          throw new Skip('no text field to change');
        }
        updatedValue = `${String(created?.[updateField] ?? 'x')}-upd`;
        await handle.update(id, { [updateField]: updatedValue });
        const record = await handle.get(id);
        if (record[updateField] !== updatedValue) {
          throw new Error(`${updateField} did not change after the update`);
        }
        return `${updateField} = "${updatedValue}"`;
      }))
    ) {
      await cleanup();
      return;
    }

    if (
      !(await this.step(7, async () => {
        await handle.delete(id);
        return `deleted #${id}`;
      }))
    ) {
      await cleanup();
      return;
    }

    await this.step(8, async () => {
      try {
        await handle.get(id);
      } catch (error) {
        if (error instanceof SethuApiError && error.code === 'NOT_FOUND') {
          return 'NOT_FOUND, as expected';
        }
        throw error;
      }
      throw new Error('The record can still be read after delete');
    });
  }

  // Run one step: mark running, then pass / skip / fail.
  private async step(
    index: number,
    work: () => Promise<string>,
  ): Promise<boolean> {
    this.set(index, 'running', '');
    try {
      this.set(index, 'pass', await work());
      return true;
    } catch (error) {
      if (error instanceof Skip) {
        this.set(index, 'skip', error.message);
        return true;
      }
      this.set(index, 'fail', describeError(error));
      return false;
    }
  }

  private set(index: number, status: Status, detail: string): void {
    this.steps.update((list) =>
      list.map((s, i) => (i === index ? { ...s, status, detail } : s)),
    );
  }
}

/**
 * Values for the required, non-key fields of a collection, or null when a
 * required field has a type we cannot fill (so it is no scratch candidate).
 * Strings look like "selfcheck-<stamp>", which also fits slug patterns.
 */
function scratchValues(
  collection: CollectionInfo,
  stamp: string,
): RecordData | null {
  const values: RecordData = {};
  let hasText = false;
  for (const f of collection.fields as FieldInfo[]) {
    if (f.primaryKey) continue;
    const text = `selfcheck-${stamp}`;
    if (f.type === 'string' || f.type === 'text') {
      if (f.required || !hasText) {
        values[f.name] = text;
        hasText = true;
      }
    } else if (f.required) {
      switch (f.type) {
        case 'integer':
        case 'decimal':
        case 'reference':
          values[f.name] = 1;
          break;
        case 'boolean':
          values[f.name] = false;
          break;
        case 'date':
          values[f.name] = new Date().toISOString().slice(0, 10);
          break;
        case 'datetime':
          values[f.name] = new Date().toISOString();
          break;
        case 'json':
          values[f.name] = {};
          break;
        case 'array':
          values[f.name] = [];
          break;
        default:
          return null; // binary, geopoint, unknown
      }
    }
  }
  return values;
}
