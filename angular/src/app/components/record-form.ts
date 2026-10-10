/**
 * Create / edit / delete form generated from the collection's fields
 * (string, number, boolean, date, json; anything else falls back to text).
 *
 * Demonstrates collection.create / update / delete, showing SethuApiError
 * code + message (and details), and honouring read_only connections.
 */
import {
  Component,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import type { RecordData } from '@sethucms/sdk';
import { SethuService, describeError } from '../sethu.service';
import { isSethuApiError } from '@sethucms/sdk';
import {
  fromRaw,
  kindOf,
  primaryKeyOf,
  toRaw,
  type FieldInfo,
  type RawValue,
} from '../util/fields';

@Component({
  selector: 'app-record-form',
  template: `
    <section class="panel form-panel" aria-label="Record form">
      <div class="row between">
        <h2>{{ record() ? 'Edit record' : 'New record' }}</h2>
        <button type="button" (click)="closed.emit()">Close</button>
      </div>

      @if (svc.readOnly()) {
        <p class="note" data-testid="readonly-note">
          This connection is read-only. Fields are shown but cannot be saved.
        </p>
      }

      <form (submit)="save($event)">
        @for (f of fields(); track f.name) {
          <label class="field">
            <span>
              {{ f.name }}
              <small class="muted"
                >{{ f.type }}{{ f.required ? ', required' : '' }}</small
              >
            </span>
            @switch (kind(f)) {
              @case ('boolean') {
                <input
                  type="checkbox"
                  [name]="'f_' + f.name"
                  [checked]="raw()[f.name] === true"
                  [disabled]="locked(f)"
                  (change)="setRaw(f.name, checked($event))"
                />
              }
              @case ('textarea') {
                <textarea
                  rows="3"
                  [name]="'f_' + f.name"
                  [value]="str(f.name)"
                  [disabled]="locked(f)"
                  (input)="setRaw(f.name, val($event))"
                ></textarea>
              }
              @case ('json') {
                <textarea
                  rows="3"
                  class="mono"
                  [name]="'f_' + f.name"
                  [value]="str(f.name)"
                  [disabled]="locked(f)"
                  placeholder='JSON, e.g. ["a", "b"]'
                  (input)="setRaw(f.name, val($event))"
                ></textarea>
              }
              @default {
                <input
                  [type]="inputType(f)"
                  [step]="f.type === 'integer' ? '1' : 'any'"
                  [name]="'f_' + f.name"
                  [value]="str(f.name)"
                  [disabled]="locked(f)"
                  (input)="setRaw(f.name, val($event))"
                />
              }
            }
          </label>
        }

        @if (error(); as message) {
          <p class="error" role="alert" data-testid="form-error">
            {{ message }}
          </p>
          @if (details()) {
            <pre class="mono small">{{ details() }}</pre>
          }
        }
        @if (info(); as message) {
          <p class="ok" data-testid="form-info">{{ message }}</p>
        }

        <div class="row">
          <button
            type="submit"
            class="primary"
            [disabled]="svc.readOnly() || busy()"
          >
            {{ record() ? 'Save changes' : 'Create' }}
          </button>
          @if (record()) {
            @if (!confirming()) {
              <button
                type="button"
                class="danger"
                [disabled]="svc.readOnly() || busy()"
                (click)="confirming.set(true)"
              >
                Delete
              </button>
            } @else {
              <button
                type="button"
                class="danger"
                [disabled]="busy()"
                (click)="remove()"
              >
                Confirm delete
              </button>
              <button type="button" (click)="confirming.set(false)">
                Keep
              </button>
            }
          }
        </div>
      </form>
    </section>
  `,
})
export class RecordForm {
  protected readonly svc = inject(SethuService);

  /** The record being edited, or null to create a new one. */
  readonly record = input<RecordData | null>(null);
  readonly saved = output<void>();
  readonly closed = output<void>();

  protected readonly raw = signal<Record<string, RawValue>>({});
  protected readonly error = signal<string | null>(null);
  protected readonly details = signal<string | null>(null);
  protected readonly info = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly confirming = signal(false);

  protected fields(): FieldInfo[] {
    return this.svc.collection()?.fields ?? [];
  }

  constructor() {
    // Reset the controls whenever the record or collection changes.
    effect(() => {
      const record = this.record();
      const fields = this.svc.collection()?.fields ?? [];
      untracked(() => {
        const values: Record<string, RawValue> = {};
        for (const f of fields) {
          values[f.name] = toRaw(f, record?.[f.name]);
        }
        this.raw.set(values);
        this.error.set(null);
        this.details.set(null);
        this.info.set(null);
        this.confirming.set(false);
      });
    });
  }

  protected kind = (f: FieldInfo) => kindOf(f.type);
  protected inputType(f: FieldInfo): string {
    switch (kindOf(f.type)) {
      case 'number':
        return 'number';
      case 'date':
        return 'date';
      case 'datetime':
        return 'datetime-local';
      default:
        return 'text';
    }
  }
  /** The generated primary key is shown, but never sent or edited. */
  protected locked(f: FieldInfo): boolean {
    return this.svc.readOnly() || f.primaryKey;
  }
  protected str(name: string): string {
    const v = this.raw()[name];
    return typeof v === 'string' ? v : '';
  }
  protected val(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }
  protected setRaw(name: string, value: RawValue): void {
    this.raw.update((r) => ({ ...r, [name]: value }));
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    const connectionId = this.svc.connectionId();
    const name = this.svc.collectionName();
    if (!connectionId || !name || this.svc.readOnly()) {
      return;
    }
    this.clearMessages();
    this.busy.set(true);
    try {
      const mode = this.record() ? 'update' : 'create';
      const values: RecordData = {};
      for (const f of this.fields()) {
        if (f.primaryKey) continue;
        const v = fromRaw(f, this.raw()[f.name], mode);
        if (v !== undefined) values[f.name] = v;
      }
      const handle = this.svc.handle(connectionId, name);
      if (this.record()) {
        await handle.update(this.idOf(), values);
        this.info.set('Saved.');
      } else {
        const created = await handle.create(values);
        this.info.set(
          `Created #${String(created[primaryKeyOf(this.fields())] ?? '')}.`,
        );
      }
      this.saved.emit();
    } catch (error) {
      this.showError(error);
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const connectionId = this.svc.connectionId();
    const name = this.svc.collectionName();
    if (!connectionId || !name || !this.record()) {
      return;
    }
    this.clearMessages();
    this.busy.set(true);
    try {
      await this.svc.handle(connectionId, name).delete(this.idOf());
      this.saved.emit();
      this.closed.emit();
    } catch (error) {
      this.showError(error);
      this.confirming.set(false);
    } finally {
      this.busy.set(false);
    }
  }

  private idOf(): string {
    return String(this.record()?.[primaryKeyOf(this.fields())] ?? '');
  }

  private clearMessages(): void {
    this.error.set(null);
    this.details.set(null);
    this.info.set(null);
  }

  private showError(error: unknown): void {
    this.error.set(describeError(error));
    if (isSethuApiError(error) && error.details) {
      this.details.set(JSON.stringify(error.details, null, 2));
    }
  }
}
