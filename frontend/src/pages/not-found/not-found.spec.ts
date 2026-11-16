import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NotFound } from './not-found';
import { Theme } from '../../shared/services/theme';

describe('NotFound', () => {
  let component: NotFound;
  let fixture: ComponentFixture<NotFound>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotFound],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(NotFound);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display the 404 error code and heading', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.error-code')?.textContent?.trim()).toBe('404');
    expect(compiled.querySelector('h1')?.textContent?.trim()).toBe('Pagina non trovata');
  });

  it('should show the symbol matching the active theme', () => {
    const theme = TestBed.inject(Theme);
    const symbol = (): HTMLImageElement | null =>
      (fixture.nativeElement as HTMLElement).querySelector('.not-found-symbol');

    expect(symbol()?.getAttribute('src')).toBe(
      theme.themeReadonly() === 'dark' ? '/brand/symbol-light.svg' : '/brand/symbol-dark.svg',
    );

    theme.toggleTheme();
    fixture.detectChanges();

    expect(symbol()?.getAttribute('src')).toBe(
      theme.themeReadonly() === 'dark' ? '/brand/symbol-light.svg' : '/brand/symbol-dark.svg',
    );
  });

  it('should contain a link to return to the home page', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const homeLink = compiled.querySelector('a[routerLink="/"]') as HTMLAnchorElement;
    expect(homeLink).toBeTruthy();
    expect(homeLink.textContent).toContain('Torna alla Home');
  });
});
