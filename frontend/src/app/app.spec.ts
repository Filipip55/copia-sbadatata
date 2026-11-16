import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { App } from './app';

@Component({ template: '<div>Mock Page</div>' })
class MockComponent {}

describe('App', () => {
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([
          { path: '', component: MockComponent },
          { path: 'login', component: MockComponent },
          { path: 'register', component: MockComponent },
          { path: 'profile', component: MockComponent },
          { path: 'favorites', component: MockComponent },
          { path: '**', component: MockComponent },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function flushHeaderApis(): void {
    const genresReq = httpMock.match('/api/genres/');
    genresReq.forEach((req) => req.flush([]));
    const platformsReq = httpMock.match('/api/platforms/');
    platformsReq.forEach((req) => req.flush([]));
  }

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    flushHeaderApis();
    expect(app).toBeTruthy();
  });

  it('should render the router outlet', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    flushHeaderApis();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).toBeTruthy();
  });

  it('should show header and bottom navigation on main pages', async () => {
    await router.navigate(['/']);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    flushHeaderApis();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-header')).toBeTruthy();
    expect(compiled.querySelector('app-bottom-navigation')).toBeTruthy();
    expect(fixture.componentInstance.showNav()).toBe(true);
  });

  it('should hide header and bottom navigation on login, register, and profile', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    flushHeaderApis();

    await router.navigate(['/login']);
    fixture.detectChanges();
    expect(fixture.componentInstance.showNav()).toBe(false);
    expect(fixture.nativeElement.querySelector('app-header')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('app-bottom-navigation')).toBeFalsy();

    await router.navigate(['/register']);
    fixture.detectChanges();
    expect(fixture.componentInstance.showNav()).toBe(false);
    expect(fixture.nativeElement.querySelector('app-header')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('app-bottom-navigation')).toBeFalsy();

    await router.navigate(['/profile']);
    fixture.detectChanges();
    expect(fixture.componentInstance.showNav()).toBe(false);
    expect(fixture.nativeElement.querySelector('app-header')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('app-bottom-navigation')).toBeFalsy();
  });

  it('should show header and bottom navigation on not found / unknown routes', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    flushHeaderApis();

    await router.navigate(['/unknown-path-404']);
    fixture.detectChanges();
    expect(fixture.componentInstance.showNav()).toBe(true);
    expect(fixture.nativeElement.querySelector('app-header')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-bottom-navigation')).toBeTruthy();
  });
});
