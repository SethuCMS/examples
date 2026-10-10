/**
 * Records table: sorting, a one-field filter built with the SDK filter
 * helpers (eq, contains, gt ...), and forward/back cursor pagination.
 *
 * Demonstrates the immutable query builder:
 *   collection.query().where(filter).orderBy(field, dir).limit(n).after(cursor).list()
 * and auto-refresh: an effect reloads the page when the live feed reports a
 * change to the open collection.
 */
import {
  Component,
  DestroyRef,
  effect,
  inject,
  output,
  signal,
  untracked,
} from '@angular/core';
import {
  contains,
  eq,
  gt,
  gte,
  lt,
  lte,
  ne,
  startsWith,
  type Filter,
  type RecordData,
} from '@sethucms/sdk';
import { SethuService, describeError } from '../sethu.service';
import { display, kindOf, primaryKeyOf } from '../util/fields';

const OPERATORS = {
  eq,
  ne,
  gt,
  gte,
  lt,
  lte,
  contains,
  startsWith,
} as const;
type OperatorName = keyof typeof OPERATORS;
const OPERATOR_NAMES = Object.keys(OPERATORS) as OperatorName[];

@Component({
  selector: 'app-records-table',
  template: `
    <section class="panel table-panel" aria-label="Records">
      <div class="row between">
        <h2>Records</h2>
        <div class="row">
          <button type="button" (click)="reload()">Refresh</button>
          <button
            type="button"
            class="primary"
            [disabled]="svc.readOnly() || !svc.collection()"
            (click)="create.emit()"
          >
            New record
          </button>
        </div>
      </div>

      <form class="filter row" (submit)="applyFilter($event)">
        <label>
          Filter field
          <select
            name="fFilterField"
            [value]="filterField()"
            (change)="filterField.set(val($event))"
          >
            <option value="">(none)</option>
            @for (f of svc.collection()?.fields ?? []; track f.name) {
              <option [value]="f.name" [selected]="f.name === filterField()">
                {{ f.name }}
              </option>
            }
          </select>
        </label>
        <label>
          Operator
          <select
            name="fFilterOp"
            [value]="filterOp()"
            (change)="filterOp.set(opVal($event))"
          >
            @for (op of operators; track op) {
              <option [value]="op" [selected]="op === filterOp()">
                {{ op }}
              </option>
            }
          </select>
        </label>
        <label>
          Value
          <input
            name="fFilterValue"
            [value]="filterValue()"
            (input)="filterValue.set(val($event))"
          />
        </label>
        <button type="submit">Apply filter</button>
        <button type="button" (click)="clearFilter()">Clear</button>
        <label>
          Page size
          <select name="fPageSize" (change)="setPageSize(val($event))">
            @for (n of pageSizes; track n) {
              <option [value]="n" [selected]="n === pageSize()">{{ n }}</option>
            }
          </select>
        </label>
      </form>

      @if (error(); as message) {
        <p class="error" role="alert" data-testid="table-error">
          {{ message }}
        </p>
      }
      @for (note of notes(); track note) {
        <p class="note">Server note: {{ note }}</p>
      }

      <div class="scroll">
        <table data-testid="records">
          <thead>
            <tr>
              @for (f of svc.collection()?.fields ?? []; track f.name) {
                <th>
                  <button
                    type="button"
                    class="link"
                    (click)="toggleSort(f.name)"
                  >
                    {{ f.name }}{{ arrow(f.name) }}
                  </button>
                </th>
              }
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track $index) {
              <tr
                [class.selected]="selectedId() === idOf(row)"
                (click)="select(row)"
                data-testid="row"
              >
                @for (f of svc.collection()?.fields ?? []; track f.name) {
                  <td>{{ show(row[f.name]) }}</td>
                }
              </tr>
            } @empty {
              <tr>
                <td
                  [attr.colspan]="svc.collection()?.fields?.length || 1"
                  class="muted"
                >
                  {{ busy() ? 'Loading...' : 'No records.' }}
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <div class="row between">
        <span class="muted" data-testid="page-info">
          Page {{ pageIndex() + 1 }} - {{ rows().length }} row(s)
        </span>
        <div class="row">
          <button
            type="button"
            [disabled]="pageIndex() === 0 || busy()"
            (click)="go(-1)"
          >
            Previous
          </button>
          <button
            type="button"
            [disabled]="!nextCursor() || busy()"
            (click)="go(1)"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  `,
})
export class RecordsTable {
  protected readonly svc = inject(SethuService);

  /** Emitted when the user clicks a row. */
  readonly edit = output<RecordData>();
  /** Emitted when the user presses "New record". */
  readonly create = output<void>();

  protected readonly operators = OPERATOR_NAMES;
  protected readonly pageSizes = [2, 5, 10, 25, 50];

  protected readonly rows = signal<RecordData[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly notes = signal<string[]>([]);
  protected readonly busy = signal(false);
  protected readonly selectedId = signal<string | null>(null);

  // Query state
  protected readonly sortField = signal<string | null>(null);
  protected readonly sortDir = signal<'asc' | 'desc'>('asc');
  protected readonly filterField = signal('');
  protected readonly filterOp = signal<OperatorName>('eq');
  protected readonly filterValue = signal('');
  private activeFilter: Filter | null = null;
  protected readonly pageSize = signal(10);

  // Cursor paging: cursors[i] is the cursor that opens page i.
  private cursors: Array<string | null> = [null];
  protected readonly pageIndex = signal(0);
  protected readonly nextCursor = signal<string | null>(null);

  private abort: AbortController | undefined;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    // New collection -> reset the query and load the first page.
    effect(() => {
      this.svc.connectionId();
      const name = this.svc.collectionName();
      untracked(() => this.resetAndLoad(name));
    });

    // Live feed -> refresh when the open collection changed.
    effect(() => {
      const event = this.svc.lastEvent();
      untracked(() => {
        if (
          event &&
          event.connectionId === this.svc.connectionId() &&
          event.collection === this.svc.collectionName()
        ) {
          clearTimeout(this.refreshTimer);
          this.refreshTimer = setTimeout(() => void this.load(), 150);
        }
      });
    });

    inject(DestroyRef).onDestroy(() => {
      this.abort?.abort();
      clearTimeout(this.refreshTimer);
    });
  }

  protected val(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
  protected opVal(event: Event): OperatorName {
    return this.val(event) as OperatorName;
  }
  protected show = display;

  protected idOf(row: RecordData): string {
    const fields = this.svc.collection()?.fields ?? [];
    return String(row[primaryKeyOf(fields)] ?? '');
  }

  protected select(row: RecordData): void {
    this.selectedId.set(this.idOf(row));
    this.edit.emit(row);
  }

  protected arrow(field: string): string {
    if (this.sortField() !== field) return '';
    return this.sortDir() === 'asc' ? ' ▲' : ' ▼';
  }

  /** none -> asc -> desc -> none */
  protected toggleSort(field: string): void {
    if (this.sortField() !== field) {
      this.sortField.set(field);
      this.sortDir.set('asc');
    } else if (this.sortDir() === 'asc') {
      this.sortDir.set('desc');
    } else {
      this.sortField.set(null);
    }
    this.firstPage();
  }

  protected applyFilter(event: Event): void {
    event.preventDefault();
    const fieldName = this.filterField();
    const field = this.svc
      .collection()
      ?.fields.find((f) => f.name === fieldName);
    const text = this.filterValue();
    if (!field || text === '') {
      this.activeFilter = null;
    } else {
      const kind = kindOf(field.type);
      const value =
        kind === 'number' && Number.isFinite(Number(text))
          ? Number(text)
          : kind === 'boolean'
            ? text.toLowerCase() === 'true'
            : text;
      const op = this.filterOp();
      this.activeFilter =
        op === 'startsWith'
          ? startsWith(field.name, String(value))
          : OPERATORS[op](field.name, value);
    }
    this.firstPage();
  }

  protected clearFilter(): void {
    this.filterField.set('');
    this.filterValue.set('');
    this.activeFilter = null;
    this.firstPage();
  }

  protected setPageSize(text: string): void {
    this.pageSize.set(Number(text));
    this.firstPage();
  }

  protected go(step: 1 | -1): void {
    if (step === 1) {
      this.cursors = [
        ...this.cursors.slice(0, this.pageIndex() + 1),
        this.nextCursor(),
      ];
    }
    this.pageIndex.update((i) => i + step);
    void this.load();
  }

  reload(): void {
    void this.load();
  }

  private firstPage(): void {
    this.cursors = [null];
    this.pageIndex.set(0);
    void this.load();
  }

  private resetAndLoad(name: string | null): void {
    this.sortField.set(null);
    this.filterField.set('');
    this.filterValue.set('');
    this.activeFilter = null;
    this.selectedId.set(null);
    this.rows.set([]);
    if (name) {
      this.firstPage();
    } else {
      this.abort?.abort();
      this.busy.set(false);
    }
  }

  /** Fetch the current page with the SDK query builder. */
  async load(): Promise<void> {
    const connectionId = this.svc.connectionId();
    const name = this.svc.collectionName();
    if (!connectionId || !name) {
      return;
    }
    this.abort?.abort();
    const abort = new AbortController();
    this.abort = abort;
    this.busy.set(true);
    try {
      let query = this.svc
        .handle(connectionId, name)
        .query()
        .limit(this.pageSize())
        .after(this.cursors[this.pageIndex()] ?? null);
      if (this.activeFilter) {
        query = query.where(this.activeFilter);
      }
      const sort = this.sortField();
      if (sort) {
        query = query.orderBy(sort, this.sortDir());
      }
      const page = await query.list({ signal: abort.signal });
      this.rows.set(page.data);
      this.nextCursor.set(page.nextCursor);
      this.notes.set(page.notes);
      this.error.set(null);
    } catch (error) {
      if (!abort.signal.aborted) {
        this.error.set(describeError(error));
        this.rows.set([]);
        this.nextCursor.set(null);
      }
    } finally {
      if (this.abort === abort) {
        this.busy.set(false);
      }
    }
  }
}
