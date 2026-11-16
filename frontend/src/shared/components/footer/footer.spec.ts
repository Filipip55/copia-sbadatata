import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Footer } from './footer';

describe('Footer', () => {
  let component: Footer;
  let fixture: ComponentFixture<Footer>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Footer],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(Footer);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render the brand logo', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const logoDark = compiled.querySelector<HTMLImageElement>('.footer-logo.logo-dark');
    const logoLight = compiled.querySelector<HTMLImageElement>('.footer-logo.logo-light');

    expect(logoDark).toBeTruthy();
    expect(logoDark?.getAttribute('src')).toBe('/brand/logo-dark.svg');
    expect(logoLight).toBeTruthy();
    expect(logoLight?.getAttribute('src')).toBe('/brand/logo-light.svg');
  });

  it('should render "Game Inn" in about and copyright text', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Game Inn is a video game discovery platform');
    expect(compiled.textContent).toContain(`© ${new Date().getFullYear()} Game Inn`);
    expect(compiled.textContent).not.toContain('GameInn');
  });
});
