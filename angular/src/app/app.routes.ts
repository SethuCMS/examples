/**
 * Two lazy pages: the records workbench and the self-check.
 */
import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/records-page').then((m) => m.RecordsPage),
  },
  {
    path: 'self-check',
    loadComponent: () =>
      import('./pages/self-check-page').then((m) => m.SelfCheckPage),
  },
  { path: '**', redirectTo: '' },
];
