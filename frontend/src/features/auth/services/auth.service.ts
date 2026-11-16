import { Service, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, firstValueFrom, throwError } from 'rxjs';
import { catchError, finalize, shareReplay, tap } from 'rxjs/operators';
import {
  LoginRequest,
  LoginResponse,
  RefreshResponse,
  RegisterRequest,
  RegisteredUser,
  ChangePasswordRequest,
  ChangeUsernameRequest,
  UserProfile,
} from '../models/auth.models';

/**
 * Authentication state and API calls for the current user.
 *
 * JWTs are stored in localStorage; `isAuthenticated` and `currentUser`
 * are signals that the rest of the app reacts to.
 */
@Service()
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly accessTokenKey = 'access_token';
  private readonly refreshTokenKey = 'refresh_token';
  /** Shared in-flight refresh request, so concurrent 401s trigger a single refresh. */
  private refreshInProgress$: Observable<RefreshResponse> | null = null;
  /** Whether an access token is stored (it may still be expired). */
  isAuthenticated = signal<boolean>(Boolean(localStorage.getItem(this.accessTokenKey)));
  /** Profile of the logged-in user, or `null` when logged out or not loaded yet. */
  currentUser = signal<UserProfile | null>(null);

  /** Creates a new account. Does not log the user in. */
  register(request: RegisterRequest): Observable<RegisteredUser> {
    return this.http.post<RegisteredUser>('/api/auth/register/', request);
  }

  /** Exchanges credentials for a JWT pair. Call `storeTokens` with the result. */
  login(request: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>('/api/auth/login/', request);
  }

  /** Fetches the authenticated user's profile. */
  getProfile(): Observable<UserProfile> {
    return this.http.get<UserProfile>('/api/auth/me/');
  }

  /** Saves the user's preferred UI theme. */
  updateTheme(theme_preference: UserProfile['theme_preference']): Observable<UserProfile> {
    return this.http.patch<UserProfile>('/api/auth/me/', { theme_preference });
  }

  /** Saves the user's avatar; `null` restores the default one. */
  updateAvatar(avatar: number | null): Observable<UserProfile> {
    return this.http.patch<UserProfile>('/api/auth/me/', { avatar });
  }

  /** Changes the username (allowed at most once every 14 days). */
  changeUsername(request: ChangeUsernameRequest): Observable<UserProfile> {
    return this.http.post<UserProfile>('/api/auth/change-username/', request);
  }

  /** Changes the password after verifying the current one. */
  changePassword(request: ChangePasswordRequest): Observable<{ detail: string }> {
    return this.http.post<{ detail: string }>('/api/auth/change-password/', request);
  }

  /**
   * Gets a new access token using the stored refresh token.
   *
   * Concurrent calls share the same request. On failure the tokens are cleared.
   *
   * @returns The new tokens, or an error if no refresh token is stored.
   */
  refreshToken(): Observable<RefreshResponse> {
    const refreshToken = localStorage.getItem(this.refreshTokenKey);
    if (!refreshToken) {
      this.clearTokens();
      return throwError(() => new Error('No refresh token available'));
    }

    if (this.refreshInProgress$) {
      return this.refreshInProgress$;
    }

    this.refreshInProgress$ = this.http
      .post<RefreshResponse>('/api/auth/refresh/', { refresh: refreshToken })
      .pipe(
        tap((response) => {
          localStorage.setItem(this.accessTokenKey, response.access);
          if (response.refresh) {
            localStorage.setItem(this.refreshTokenKey, response.refresh);
          }
          this.isAuthenticated.set(true);
        }),
        catchError((err) => {
          this.clearTokens();
          return throwError(() => err);
        }),
        finalize(() => {
          this.refreshInProgress$ = null;
        }),
        shareReplay(1),
      );

    return this.refreshInProgress$;
  }

  /**
   * Blacklists the refresh token on the server and resets the local state.
   *
   * Tokens are not removed here: callers should call `clearTokens` when the
   * request completes, whatever its outcome.
   */
  logout(): Observable<{ detail: string }> {
    const refreshToken = localStorage.getItem(this.refreshTokenKey);
    this.isAuthenticated.set(false);
    this.currentUser.set(null);
    return this.http.post<{ detail: string }>('/api/auth/logout/', {
      refresh: refreshToken,
    });
  }

  /** Permanently deletes the account after verifying the password. */
  deleteAccount(password: string): Observable<void> {
    return this.http.delete<void>('/api/auth/me/', { body: { password } });
  }

  /** Removes the stored tokens and resets the authentication state. */
  clearTokens(): void {
    localStorage.removeItem(this.accessTokenKey);
    localStorage.removeItem(this.refreshTokenKey);
    this.isAuthenticated.set(false);
    this.currentUser.set(null);
  }

  /** Stores the JWT pair and marks the user as authenticated. */
  storeTokens(response: LoginResponse): void {
    localStorage.setItem(this.accessTokenKey, response.access);
    localStorage.setItem(this.refreshTokenKey, response.refresh);
    this.isAuthenticated.set(true);
  }

  /** Updates the cached profile of the current user. */
  setCurrentUser(profile: UserProfile): void {
    this.currentUser.set(profile);
  }

  /**
   * Restores the session at app startup.
   *
   * Loads the profile with the stored access token; if that fails, tries a
   * refresh first. If both fail, the tokens are cleared.
   */
  async initializeAuth(): Promise<void> {
    const accessToken = localStorage.getItem(this.accessTokenKey);
    const refreshToken = localStorage.getItem(this.refreshTokenKey);

    if (!accessToken && !refreshToken) {
      this.clearTokens();
      return;
    }

    if (accessToken) {
      try {
        const profile = await firstValueFrom(this.getProfile());
        this.setCurrentUser(profile);
        this.isAuthenticated.set(true);
        return;
      } catch {
        // Access token might be expired, attempt refresh below if refresh token exists
      }
    }

    if (refreshToken) {
      try {
        await firstValueFrom(this.refreshToken());
        const profile = await firstValueFrom(this.getProfile());
        this.setCurrentUser(profile);
        this.isAuthenticated.set(true);
        return;
      } catch {
        this.clearTokens();
        return;
      }
    }

    this.clearTokens();
  }
}
