import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { Header } from './header';

describe('Header', () => {
  let component: Header;
  let fixture: ComponentFixture<Header>;
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });

    await TestBed.configureTestingModule({
      imports: [Header],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(Header);
    component = fixture.componentInstance;
    fixture.detectChanges();

    httpMock.expectOne('/api/genres/').flush([]);
    httpMock.expectOne('/api/platforms/').flush([]);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('naviga a /search-results con testo e filtri alla pressione di Invio', () => {
    let navigatedUrl: unknown = null;
    let navigatedExtras: unknown = null;
    router.navigate = (commands: unknown[], extras?: unknown) => {
      navigatedUrl = commands;
      navigatedExtras = extras;
      return Promise.resolve(true);
    };

    component.toggleSearch();
    component.searchControl.setValue('zelda');
    component.toggleGenre(12);
    component.togglePlatform(130);
    component.updateOrdering('-aggregated_rating');
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('#search-input') as HTMLInputElement;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(navigatedUrl).toEqual(['/search-results']);
    expect(navigatedExtras).toEqual({
      queryParams: {
        q: 'zelda',
        genres: '12',
        platforms: '130',
        ordering: '-aggregated_rating',
      },
    });
    expect(component.isSearchOpen()).toBe(false);
  });

  it('non naviga se non ci sono criteri di ricerca né filtri', () => {
    let called = false;
    router.navigate = () => {
      called = true;
      return Promise.resolve(true);
    };

    component.toggleSearch();
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('#search-input') as HTMLInputElement;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(called).toBe(false);
  });

  it("chiude il dropdown dell'account se si clicca all'esterno", () => {
    component.toggleAccount();
    fixture.detectChanges();
    expect(component.isAccountOpen()).toBe(true);

    const outsideElement = document.createElement('div');
    document.body.appendChild(outsideElement);

    const clickEvent = new MouseEvent('click', { bubbles: true });
    outsideElement.dispatchEvent(clickEvent);
    fixture.detectChanges();

    expect(component.isAccountOpen()).toBe(false);
    document.body.removeChild(outsideElement);
  });

  it("non chiude il dropdown dell'account se si clicca al suo interno", () => {
    component.toggleAccount();
    fixture.detectChanges();
    expect(component.isAccountOpen()).toBe(true);

    const dropdownEl = fixture.nativeElement.querySelector('app-account-dropdown') as HTMLElement;
    expect(dropdownEl).toBeTruthy();

    const clickEvent = new MouseEvent('click', { bubbles: true });
    dropdownEl.dispatchEvent(clickEvent);
    fixture.detectChanges();

    expect(component.isAccountOpen()).toBe(true);
  });

  it("chiude il dropdown dei filtri se si clicca all'esterno", () => {
    component.toggleFilters();
    fixture.detectChanges();
    expect(component.isFilterOpen()).toBe(true);

    const outsideElement = document.createElement('div');
    document.body.appendChild(outsideElement);

    const clickEvent = new MouseEvent('click', { bubbles: true });
    outsideElement.dispatchEvent(clickEvent);
    fixture.detectChanges();

    expect(component.isFilterOpen()).toBe(false);
    document.body.removeChild(outsideElement);
  });

  it('non chiude il dropdown dei filtri se si clicca al suo interno', () => {
    component.toggleFilters();
    fixture.detectChanges();
    expect(component.isFilterOpen()).toBe(true);

    const filtersDropdownEl = fixture.nativeElement.querySelector(
      'app-filters-dropdown',
    ) as HTMLElement;
    expect(filtersDropdownEl).toBeTruthy();

    const clickEvent = new MouseEvent('click', { bubbles: true });
    filtersDropdownEl.dispatchEvent(clickEvent);
    fixture.detectChanges();

    expect(component.isFilterOpen()).toBe(true);
  });

  it("chiude la barra di ricerca se si clicca all'esterno", () => {
    component.toggleSearch();
    fixture.detectChanges();
    expect(component.isSearchOpen()).toBe(true);

    const outsideElement = document.createElement('div');
    document.body.appendChild(outsideElement);

    const clickEvent = new MouseEvent('click', { bubbles: true });
    outsideElement.dispatchEvent(clickEvent);
    fixture.detectChanges();

    expect(component.isSearchOpen()).toBe(false);
    document.body.removeChild(outsideElement);
  });

  it('chiude i dropdown alla pressione del tasto Escape', () => {
    component.toggleAccount();
    fixture.detectChanges();
    expect(component.isAccountOpen()).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(component.isAccountOpen()).toBe(false);

    component.toggleFilters();
    fixture.detectChanges();
    expect(component.isFilterOpen()).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(component.isFilterOpen()).toBe(false);
  });

  it("lo scroll non nasconde l'header quando i filtri sono aperti", () => {
    component.toggleFilters();
    fixture.detectChanges();
    expect(component.isFilterOpen()).toBe(true);
    expect(component.isHidden()).toBe(false);

    // Simulate scrolling down
    window.scrollY = 100;
    component.onWindowScroll();
    expect(component.isHidden()).toBe(false);
  });

  it("lo scroll non nasconde l'header quando l'account è aperto", () => {
    component.toggleAccount();
    fixture.detectChanges();
    expect(component.isAccountOpen()).toBe(true);
    expect(component.isHidden()).toBe(false);

    // Simulate scrolling down
    window.scrollY = 100;
    component.onWindowScroll();
    expect(component.isHidden()).toBe(false);
  });
});
