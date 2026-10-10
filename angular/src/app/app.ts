/**
 * Root shell: settings bar on top, a two-link nav, and the routed page.
 * Demonstrates standalone components + the router with no NgModules.
 */
import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SettingsBar } from './components/settings-bar';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, SettingsBar],
  template: `
    <header class="top">
      <h1>SethuCMS Angular example</h1>
      <nav>
        <a
          routerLink="/"
          routerLinkActive="active"
          [routerLinkActiveOptions]="{ exact: true }"
          >Records</a
        >
        <a routerLink="/self-check" routerLinkActive="active">Self-check</a>
      </nav>
    </header>
    <app-settings-bar />
    <main><router-outlet /></main>
  `,
})
export class App {}
