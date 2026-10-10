/**
 * Settings bar: gateway URL, bearer token and a live health indicator.
 * Demonstrates signal-backed form fields and calling SethuService.connect().
 * The token stays in memory + sessionStorage (never localStorage).
 */
import { Component, inject } from '@angular/core';
import { SethuService } from '../sethu.service';

@Component({
  selector: 'app-settings-bar',
  template: `
    <section class="panel settings" aria-label="Settings">
      <label>
        Gateway URL
        <input
          name="baseUrl"
          type="url"
          [value]="svc.baseUrl()"
          (input)="svc.baseUrl.set(text($event))"
          (keydown.enter)="svc.connect()"
          placeholder="http://127.0.0.1:8080"
        />
      </label>
      <label>
        Bearer token
        <input
          name="token"
          type="password"
          autocomplete="off"
          [value]="svc.token()"
          (input)="svc.token.set(text($event))"
          (keydown.enter)="svc.connect()"
          placeholder="admin token"
        />
      </label>
      <button type="button" class="primary" (click)="svc.connect()">
        Connect
      </button>
      <span
        class="health"
        data-testid="health"
        [class]="'health ' + svc.health()"
      >
        <span class="dot"></span>
        @switch (svc.health()) {
          @case ('ok') {
            Gateway healthy
          }
          @case ('down') {
            Gateway unreachable
          }
          @case ('checking') {
            Checking...
          }
          @default {
            Not checked
          }
        }
      </span>
      @if (svc.connectError(); as message) {
        <p class="error full" role="alert" data-testid="connect-error">
          {{ message }}
        </p>
      }
    </section>
  `,
})
export class SettingsBar {
  protected readonly svc = inject(SethuService);

  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
