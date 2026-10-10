/**
 * Live feed panel: shows what /v1/events pushes (record/draft/connection
 * changes). Demonstrates reading SSE-driven signals from SethuService.
 * Events carry ids only, never field values.
 */
import { Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { SethuService } from '../sethu.service';

@Component({
  selector: 'app-live-feed',
  imports: [DatePipe],
  template: `
    <section class="panel feed" aria-label="Live feed">
      <div class="row between">
        <h2>Live feed</h2>
        <span
          class="chip"
          [class]="'chip ' + svc.stream()"
          data-testid="stream-state"
        >
          {{ svc.stream() }}
        </span>
      </div>
      @if (svc.streamMessage(); as message) {
        <p class="error" data-testid="stream-error">{{ message }}</p>
      }
      <div class="row">
        <button type="button" (click)="svc.startStream()">Reconnect</button>
        <button type="button" (click)="svc.clearFeed()">Clear</button>
      </div>
      <ol class="events" data-testid="feed">
        @for (item of svc.feed(); track item.n) {
          <li data-testid="feed-item">
            <time>{{ item.at | date: 'HH:mm:ss' }}</time>
            <strong>{{ item.type }}</strong>
            @if (item.collection) {
              <span>{{ item.collection }}</span>
            }
            @if (item.recordId) {
              <code>#{{ item.recordId }}</code>
            }
          </li>
        } @empty {
          <li class="muted">No events yet. Create, edit or delete a record.</li>
        }
      </ol>
    </section>
  `,
})
export class LiveFeed {
  protected readonly svc = inject(SethuService);
}
