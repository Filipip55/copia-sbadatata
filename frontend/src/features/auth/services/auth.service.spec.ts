import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { UserProfile } from '../models/auth.models';

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  const mockProfile: UserProfile = {
    id: 1,
    username: 'mario',
    email: 'mario@example.com',
    avatar: null,
    theme_preference: 'dark',
    date_joined: '2026-01-01T00:00:00Z',
    favorites_count: 5,
    wishlist_count: 2,
    username_change_available_at: null,
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [AuthService, provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('salva e pulisce i token correttamente', () => {
    service.storeTokens({ access: 'access_1', refresh: 'refresh_1' });
    expect(localStorage.getItem('access_token')).toBe('access_1');
    expect(localStorage.getItem('refresh_token')).toBe('refresh_1');
    expect(service.isAuthenticated()).toBe(true);

    service.clearTokens();
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
    expect(service.currentUser()).toBeNull();
  });

  describe('refreshToken', () => {
    it('invia il refresh token e aggiorna i token ruotati', () => {
      localStorage.setItem('access_token', 'old_access');
      localStorage.setItem('refresh_token', 'old_refresh');

      let resultAccess = '';
      service.refreshToken().subscribe((res) => {
        resultAccess = res.access;
      });

      const req = http.expectOne('/api/auth/refresh/');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ refresh: 'old_refresh' });

      req.flush({ access: 'new_access', refresh: 'new_refresh' });

      expect(resultAccess).toBe('new_access');
      expect(localStorage.getItem('access_token')).toBe('new_access');
      expect(localStorage.getItem('refresh_token')).toBe('new_refresh');
      expect(service.isAuthenticated()).toBe(true);
    });

    it('cancella i token se la chiamata di refresh fallisce', () => {
      localStorage.setItem('access_token', 'old_access');
      localStorage.setItem('refresh_token', 'expired_refresh');

      let errorReceived: unknown;
      service.refreshToken().subscribe({
        error: (err) => {
          errorReceived = err;
        },
      });

      const req = http.expectOne('/api/auth/refresh/');
      req.flush(
        { detail: 'Token is invalid or expired' },
        { status: 401, statusText: 'Unauthorized' },
      );

      expect(errorReceived).toBeDefined();
      expect(localStorage.getItem('access_token')).toBeNull();
      expect(localStorage.getItem('refresh_token')).toBeNull();
      expect(service.isAuthenticated()).toBe(false);
    });

    it('condivide la stessa chiamata HTTP se ci sono richieste concorrenti', () => {
      localStorage.setItem('refresh_token', 'refresh_concurrent');

      let count = 0;
      service.refreshToken().subscribe(() => count++);
      service.refreshToken().subscribe(() => count++);

      // Only one HTTP request must be made
      const req = http.expectOne('/api/auth/refresh/');
      req.flush({ access: 'access_shared', refresh: 'refresh_shared' });

      expect(count).toBe(2);
      expect(localStorage.getItem('access_token')).toBe('access_shared');
    });
  });

  describe('initializeAuth', () => {
    it('imposta il profilo se access_token è valido', async () => {
      localStorage.setItem('access_token', 'valid_access');

      const initPromise = service.initializeAuth();

      const profileReq = http.expectOne('/api/auth/me/');
      profileReq.flush(mockProfile);

      await initPromise;

      expect(service.isAuthenticated()).toBe(true);
      expect(service.currentUser()?.username).toBe('mario');
    });

    it('tenta il refresh se access_token fallisce e preserva la sessione', async () => {
      localStorage.setItem('access_token', 'expired_access');
      localStorage.setItem('refresh_token', 'valid_refresh');

      const initPromise = service.initializeAuth();

      // First call to /api/auth/me/ fails with 401
      const firstReq = http.expectOne('/api/auth/me/');
      firstReq.flush({ detail: 'Token expired' }, { status: 401, statusText: 'Unauthorized' });

      // Wait for the async tick of the try/catch
      await Promise.resolve();

      // The refresh call must follow
      const refreshReq = http.expectOne('/api/auth/refresh/');
      refreshReq.flush({ access: 'fresh_access', refresh: 'fresh_refresh' });

      // Wait for the next async tick
      await Promise.resolve();

      // Then /api/auth/me/ is retried successfully
      const secondReq = http.expectOne('/api/auth/me/');
      secondReq.flush(mockProfile);

      await initPromise;

      expect(service.isAuthenticated()).toBe(true);
      expect(service.currentUser()?.username).toBe('mario');
      expect(localStorage.getItem('access_token')).toBe('fresh_access');
    });

    it('cancella i token se sia access che refresh falliscono', async () => {
      localStorage.setItem('access_token', 'expired_access');
      localStorage.setItem('refresh_token', 'expired_refresh');

      const initPromise = service.initializeAuth();

      const firstReq = http.expectOne('/api/auth/me/');
      firstReq.flush({ detail: 'Token expired' }, { status: 401, statusText: 'Unauthorized' });

      await Promise.resolve();

      const refreshReq = http.expectOne('/api/auth/refresh/');
      refreshReq.flush({ detail: 'Refresh expired' }, { status: 401, statusText: 'Unauthorized' });

      await initPromise;

      expect(service.isAuthenticated()).toBe(false);
      expect(service.currentUser()).toBeNull();
      expect(localStorage.getItem('access_token')).toBeNull();
      expect(localStorage.getItem('refresh_token')).toBeNull();
    });
  });
});
