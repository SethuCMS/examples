/**
 * Application providers: only the router is needed. SethuService is
 * `providedIn: 'root'`, so it needs no registration here. The app is
 * zoneless: all UI state lives in signals.
 */
import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [provideBrowserGlobalErrorListeners(), provideRouter(routes)],
};
