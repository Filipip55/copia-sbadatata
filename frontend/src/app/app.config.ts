import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideAppInitializer,
  inject,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { authInterceptor } from '../core/auth.interceptor';
import { AuthService } from '../features/auth/services/auth.service';
import { routes } from './app.routes';
import { Theme } from '../shared/services/theme';

/**
 * Application-wide providers.
 *
 * The app initializer applies the saved theme and restores the session
 * before the first render.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withInMemoryScrolling({
        scrollPositionRestoration: 'enabled',
        anchorScrolling: 'enabled',
      }),
    ),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAppInitializer(() => {
      inject(Theme);
      return inject(AuthService).initializeAuth();
    }),
  ],
};
