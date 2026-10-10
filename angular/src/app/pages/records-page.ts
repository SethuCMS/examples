/**
 * Records page: pickers, table (sort/filter/paging), create/edit form and the
 * live feed side by side. The table refreshes itself on feed events.
 */
import { Component, effect, inject, signal, untracked } from '@angular/core';
import type { RecordData } from '@sethucms/sdk';
import { Pickers } from '../components/pickers';
import { RecordForm } from '../components/record-form';
import { RecordsTable } from '../components/records-table';
import { LiveFeed } from '../components/live-feed';
import { SethuService } from '../sethu.service';

@Component({
  selector: 'app-records-page',
  imports: [Pickers, RecordsTable, RecordForm, LiveFeed],
  template: `
    <app-pickers />
    <div class="grid">
      <div class="col">
        <app-records-table #table (edit)="open($event)" (create)="open(null)" />
      </div>
      <div class="col side">
        @if (formOpen()) {
          <app-record-form
            [record]="editing()"
            (saved)="table.reload()"
            (closed)="formOpen.set(false)"
          />
        }
        <app-live-feed />
      </div>
    </div>
  `,
})
export class RecordsPage {
  private readonly svc = inject(SethuService);

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<RecordData | null>(null);

  constructor() {
    // Switching collection closes the form.
    effect(() => {
      this.svc.connectionId();
      this.svc.collectionName();
      untracked(() => this.formOpen.set(false));
    });
  }

  protected open(row: RecordData | null): void {
    this.editing.set(row);
    this.formOpen.set(true);
  }
}
