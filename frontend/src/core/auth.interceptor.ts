import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { AuthService } from '../features/auth/services/auth.service';
import { ToastService } from '../shared/services/toast';

/**
 * HTTP interceptor that adds the JWT and handles expired sessions.
 *
 * - Adds `Authorization: Bearer <access token>` to every non-public request.
 * - On a 401, refreshes the token once and retries the original request.
 * - If the refresh fails, clears the session and shows a toast; on the
 *   profile page it also redirects to `/login`.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const authService = inject(AuthService);
  const toastService = inject(ToastService);
  const router = inject(Router);

  const publicEndpoints = ['/api/genres/', '/api/platforms/'];
  if (publicEndpoints.some((url) => request.url.includes(url))) {
    return next(request);
  }

  const authEndpoints = [
    '/api/auth/login/',
    '/api/auth/register/',
    '/api/auth/refresh/',
    '/api/auth/logout/',
  ];
  const isAuthEndpoint = authEndpoints.some((url) => request.url.includes(url));

  const accessToken = localStorage.getItem('access_token');
  const authReq = accessToken
    ? request.clone({
        setHeaders: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
    : request;

  /** Clears the session and notifies the user if they were logged in. */
  const handleSessionExpired = (): void => {
    const wasAuthenticated = authService.isAuthenticated();
    authService.clearTokens();
    if (wasAuthenticated) {
      toastService.show({
        message: "Sessione scaduta. Effettua nuovamente l'accesso.",
      });
      if (router.url.startsWith('/profile')) {
        void router.navigate(['/login']);
      }
    }
  };

  return next(authReq).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }

      if (isAuthEndpoint) {
        if (request.url.includes('/api/auth/refresh/')) {
          handleSessionExpired();
        }
        return throwError(() => error);
      }

      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        handleSessionExpired();
        return throwError(() => error);
      }

      return authService.refreshToken().pipe(
        switchMap((tokens) => {
          const retriedReq = request.clone({
            setHeaders: {
              Authorization: `Bearer ${tokens.access}`,
            },
          });
          return next(retriedReq);
        }),
        catchError((refreshErr) => {
          handleSessionExpired();
          return throwError(() => refreshErr);
        }),
      );
    }),
  );
};
