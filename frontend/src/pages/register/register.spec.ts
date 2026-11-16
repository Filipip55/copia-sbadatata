import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Register } from './register';
import { Theme } from '../../shared/services/theme';

describe('Register', () => {
  let component: Register;
  let fixture: ComponentFixture<Register>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Register],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(Register);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display the "Back to home" button', () => {
    const el: HTMLElement = fixture.nativeElement;
    const homeBtn = el.querySelector('a[routerLink="/"]');
    expect(homeBtn).toBeTruthy();
    expect(homeBtn?.textContent).toContain('Back to home');
    expect(homeBtn?.querySelector('i.bi.bi-arrow-left')).toBeTruthy();
  });

  it('should show the logo matching the active theme', () => {
    const theme = TestBed.inject(Theme);
    const logo = (): HTMLImageElement | null =>
      (fixture.nativeElement as HTMLElement).querySelector('.gi-brand-logo');

    expect(logo()?.getAttribute('src')).toBe(
      theme.themeReadonly() === 'dark' ? '/brand/logo-light.svg' : '/brand/logo-dark.svg',
    );

    theme.toggleTheme();
    fixture.detectChanges();

    expect(logo()?.getAttribute('src')).toBe(
      theme.themeReadonly() === 'dark' ? '/brand/logo-light.svg' : '/brand/logo-dark.svg',
    );
  });
});
