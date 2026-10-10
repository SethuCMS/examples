/**
 * Connection and collection pickers. They bind to the signals in
 * SethuService; choosing a connection loads its collections via the SDK.
 */
import { Component, inject } from '@angular/core';
import { SethuService } from '../sethu.service';

@Component({
  selector: 'app-pickers',
  template: `
    <section class="panel pickers" aria-label="Pickers">
      <label>
        Connection
        <select
          name="connection"
          [value]="svc.connectionId() ?? ''"
          (change)="svc.selectConnection(value($event) || null)"
        >
          @for (c of svc.connections(); track c.id) {
            <option [value]="c.id" [selected]="c.id === svc.connectionId()">
              {{ c.name }} ({{ c.adapterType }}, {{ c.mode }})
            </option>
          } @empty {
            <option value="">(no connections)</option>
          }
        </select>
      </label>
      <label>
        Collection
        <select
          name="collection"
          [value]="svc.collectionName() ?? ''"
          (change)="svc.selectCollection(value($event) || null)"
        >
          @for (c of svc.collections(); track c.name) {
            <option
              [value]="c.name"
              [selected]="c.name === svc.collectionName()"
            >
              {{ c.displayName }}
            </option>
          } @empty {
            <option value="">(no collections)</option>
          }
        </select>
      </label>
      @if (svc.connection(); as c) {
        <span class="badge" [class.warn]="svc.readOnly()" data-testid="mode">
          {{ c.mode }}
        </span>
        <span class="muted">status: {{ c.status }}</span>
      }
    </section>
  `,
})
export class Pickers {
  protected readonly svc = inject(SethuService);

  protected value(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }
}
