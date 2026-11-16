import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../features/auth/services/auth.service';
import { ToastService } from '../shared/services/toast';

describe('authInterceptor', () => {
  let client: HttpClient;
  let http: HttpTestingController;
  let authServiceSpy: {
    isAuthenticated: ReturnType<typeof vi.fn>;
    refreshToken: ReturnType<typeof vi.fn>;
    clearTokens: ReturnType<typeof vi.fn>;
  };
  let toastServiceSpy: {
    show: ReturnType<typeof vi.fn>;
  };
  let routerSpy: {
    url: string;
    navigate: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    localStorage.clear();

    authServiceSpy = {
      isAuthenticated: vi.fn().mockReturnValue(true),
      refreshToken: vi.fn(),
      clearTokens: vi.fn(),
    };

    toastServiceSpy = {
      show: vi.fn(),
    };

    routerSpy = {
      url: '/',
      navigate: vi.fn().mockResolvedValue(true),
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authServiceSpy },
        { provide: ToastService, useValue: toastServiceSpy },
        { provide: Router, useValue: routerSpy },
      ],
    });

    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it("aggiunge l'header Authorization se access_token è presente", () => {
    localStorage.setItem('access_token', 'my_token');

    client.get('/api/auth/me/').subscribe();

    const req = http.expectOne('/api/auth/me/');
    expect(req.request.headers.get('Authorization')).toBe('Bearer my_token');
    req.flush({});
  });

  it("non aggiunge l'header Authorization per gli endpoint pubblici", () => {
    localStorage.setItem('access_token', 'my_token');

    client.get('/api/genres/').subscribe();

    const req = http.expectOne('/api/genres/');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush([]);
  });

  it('rinnova il token e ripete la richiesta su errore 401', () => {
    localStorage.setItem('access_token', 'old_token');
    localStorage.setItem('refresh_token', 'my_refresh');

    authServiceSpy.refreshToken.mockReturnValue(
      of({ access: 'new_token', refresh: 'new_refresh' }),
    );

    let responseData: unknown;
    client.get('/api/library/').subscribe((data) => {
      responseData = data;
    });

    // First call fails with 401
    const firstReq = http.expectOne('/api/library/');
    expect(firstReq.request.headers.get('Authorization')).toBe('Bearer old_token');
    firstReq.flush({ detail: 'Token expired' }, { status: 401, statusText: 'Unauthorized' });

    expect(authServiceSpy.refreshToken).toHaveBeenCalled();

    // Second call (retry) with the new access token
    const retryReq = http.expectOne('/api/library/');
    expect(retryReq.request.headers.get('Authorization')).toBe('Bearer new_token');
    retryReq.flush({ results: ['game1'] });

    expect(responseData).toEqual({ results: ['game1'] });
  });

  it('mostra toast e reindirizza a /login se il refresh fallisce su /profile', () => {
    localStorage.setItem('access_token', 'old_token');
    localStorage.setItem('refresh_token', 'bad_refresh');
    routerSpy.url = '/profile';

    authServiceSpy.refreshToken.mockReturnValue(throwError(() => new Error('Refresh failed')));

    let errorOccurred = false;
    client.get('/api/auth/me/').subscribe({
      error: () => {
        errorOccurred = true;
      },
    });

    const req = http.expectOne('/api/auth/me/');
    req.flush({ detail: 'Token expired' }, { status: 401, statusText: 'Unauthorized' });

    expect(errorOccurred).toBe(true);
    expect(authServiceSpy.clearTokens).toHaveBeenCalled();
    expect(toastServiceSpy.show).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Sessione scaduta') }),
    );
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('non reindirizza a /login se il refresh fallisce su una pagina pubblica', () => {
    localStorage.setItem('access_token', 'old_token');
    localStorage.setItem('refresh_token', 'bad_refresh');
    routerSpy.url = '/games/123';

    authServiceSpy.refreshToken.mockReturnValue(throwError(() => new Error('Refresh failed')));

    client.get('/api/library/').subscribe({ error: () => {} });

    const req = http.expectOne('/api/library/');
    req.flush({ detail: 'Token expired' }, { status: 401, statusText: 'Unauthorized' });

    expect(authServiceSpy.clearTokens).toHaveBeenCalled();
    expect(toastServiceSpy.show).toHaveBeenCalled();
    expect(routerSpy.navigate).not.toHaveBeenCalled();
  });

  it('non tenta il refresh se riceve 401 da /api/auth/login/', () => {
    let errorOccurred = false;
    client.post('/api/auth/login/', { username: 'x', password: 'y' }).subscribe({
      error: () => {
        errorOccurred = true;
      },
    });

    const req = http.expectOne('/api/auth/login/');
    req.flush({ detail: 'Credenziali non valide' }, { status: 401, statusText: 'Unauthorized' });

    expect(errorOccurred).toBe(true);
    expect(authServiceSpy.refreshToken).not.toHaveBeenCalled();
  });
});
