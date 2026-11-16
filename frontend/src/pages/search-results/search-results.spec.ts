import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  ActivatedRoute,
  convertToParamMap,
  ParamMap,
  provideRouter,
  Router,
} from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { SearchResults } from './search-results';
import { Game } from '../../features/games/models/game';

const makeGame = (id: number, platforms: number[] = [130]): Game => ({
  id,
  name: `Gioco ${id}`,
  slug: `gioco-${id}`,
  genres: [12],
  platforms,
  cover_url: '',
});

describe('SearchResults', () => {
  let fixture: ComponentFixture<SearchResults>;
  let el: HTMLElement;
  let httpMock: HttpTestingController;
  let router: Router;
  let queryParamMap$: BehaviorSubject<ParamMap>;

  async function setup(
    initialParams: Record<string, string> = { q: 'zelda' },
    options: { failMetadata?: boolean } = {},
  ) {
    queryParamMap$ = new BehaviorSubject(convertToParamMap(initialParams));

    await TestBed.configureTestingModule({
      imports: [SearchResults],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: queryParamMap$.asObservable() },
        },
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(SearchResults);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();

    const platformsReq = httpMock.expectOne('/api/platforms/');
    const genresReq = httpMock.expectOne('/api/genres/');
    if (options.failMetadata) {
      platformsReq.flush('Error', { status: 500, statusText: 'Server Error' });
      genresReq.flush('Error', { status: 500, statusText: 'Server Error' });
    } else {
      platformsReq.flush([
        { id: 130, name: 'Switch', slug: 'switch' },
        { id: 6, name: 'PC', slug: 'pc' },
      ]);
      genresReq.flush([
        { id: 12, name: 'Role-playing (RPG)', slug: 'role-playing-rpg' },
        { id: 31, name: 'Adventure', slug: 'adventure' },
      ]);
    }
  }

  afterEach(() => {
    httpMock.verify();
  });

  function getFiltersButton(): HTMLButtonElement {
    return el.querySelector<HTMLButtonElement>('#filters-toggle-btn')!;
  }

  it('mostra i risultati cercati usando app-game-grid e i nomi piattaforma', async () => {
    await setup({ q: 'zelda', genres: '12,31', platforms: '130', ordering: '-aggregated_rating' });

    const req = httpMock.expectOne((r) => r.url === '/api/games/');
    expect(req.request.params.get('search')).toBe('zelda');
    expect(req.request.params.get('genres')).toBe('12,31');
    expect(req.request.params.get('platforms')).toBe('130');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('page_size')).toBe('40');

    req.flush({
      count: 2,
      results: [makeGame(1, [130]), makeGame(2, [130])],
    });
    fixture.detectChanges();

    expect(el.querySelector('h1')?.textContent).toContain('Risultati per «zelda»');
    expect(el.textContent).toContain('2 giochi trovati');
    expect(el.querySelectorAll('app-game-card').length).toBe(2);
    expect(el.textContent).toContain('Switch');
  });

  it('gestisce ricerca con soli filtri senza testo e mostra stato vuoto senza criteri', async () => {
    await setup({});

    httpMock.expectNone((r) => r.url === '/api/games/');
    expect(el.textContent).toContain('Nessuna ricerca specificata.');

    queryParamMap$.next(convertToParamMap({ genres: '12' }));
    fixture.detectChanges();

    const req = httpMock.expectOne((r) => r.url === '/api/games/');
    expect(req.request.params.get('search')).toBe('');
    expect(req.request.params.get('genres')).toBe('12');
    req.flush({ count: 1, results: [makeGame(10)] });
    fixture.detectChanges();

    expect(el.querySelector('h1')?.textContent).toContain('Risultati ricerca');
    expect(el.textContent).toContain('1 gioco trovato');
    expect(el.querySelectorAll('app-game-card').length).toBe(1);
  });

  it('apre il pannello inline dei filtri e li applica solo al click su "Applica filtri"', async () => {
    await setup({ q: 'zelda', genres: '12' });

    httpMock
      .expectOne((r) => r.url === '/api/games/' && r.params.get('page') === '1')
      .flush({ count: 1, results: [makeGame(1)] });
    fixture.detectChanges();

    const filtersBtn = getFiltersButton();
    expect(filtersBtn.getAttribute('aria-expanded')).toBe('false');
    expect(filtersBtn.textContent).toContain('1');
    expect(el.querySelector('app-filters-dropdown')).toBeNull();

    filtersBtn.click();
    fixture.detectChanges();

    expect(filtersBtn.getAttribute('aria-expanded')).toBe('true');
    const panel = el.querySelector('app-filters-dropdown')!;
    expect(panel).toBeTruthy();

    let navigatedCommands: unknown = null;
    let navigatedExtras: unknown = null;
    router.navigate = (commands: unknown[], extras?: unknown) => {
      navigatedCommands = commands;
      navigatedExtras = extras;
      return Promise.resolve(true);
    };

    const checkboxes = panel.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    // checkboxes[0]=RPG (already active), [1]=Adventure, [2]=Switch, [3]=PC
    expect(checkboxes[0].checked).toBe(true);
    checkboxes[1].click();
    checkboxes[3].click();

    const ratingMin = panel.querySelector<HTMLInputElement>('#ratingMin')!;
    ratingMin.value = '80';
    ratingMin.dispatchEvent(new Event('change'));

    const orderingSelect = panel.querySelector<HTMLSelectElement>('#ordering')!;
    orderingSelect.value = '-aggregated_rating';
    orderingSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    // Editing draft filters must not trigger new requests before "Apply filters".
    httpMock.expectNone((r) => r.url === '/api/games/');
    expect(navigatedCommands).toBeNull();

    const applyBtn = Array.from(panel.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Applica filtri'),
    )!;
    applyBtn.click();
    fixture.detectChanges();

    expect(navigatedCommands).toEqual(['/search-results']);
    expect(navigatedExtras).toEqual({
      queryParams: {
        q: 'zelda',
        genres: '12,31',
        platforms: '6',
        metacritic: '80,100',
        ordering: '-aggregated_rating',
      },
    });
    expect(el.querySelector('app-filters-dropdown')).toBeNull();
  });

  it('azzera i filtri bozza e consente di riapplicare la sola ricerca testuale', async () => {
    await setup({ q: 'zelda', genres: '12', dates: '2020-01-01,2022-12-31' });

    httpMock
      .expectOne((r) => r.url === '/api/games/' && r.params.get('page') === '1')
      .flush({ count: 1, results: [makeGame(1)] });
    fixture.detectChanges();

    getFiltersButton().click();
    fixture.detectChanges();

    let navigatedExtras: unknown = null;
    router.navigate = (_commands: unknown[], extras?: unknown) => {
      navigatedExtras = extras;
      return Promise.resolve(true);
    };

    const panel = el.querySelector('app-filters-dropdown')!;
    const resetBtn = Array.from(panel.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Azzera'),
    )!;
    resetBtn.click();
    fixture.detectChanges();

    expect(resetBtn.disabled).toBe(true);
    const applyBtn = Array.from(panel.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Applica filtri'),
    )!;
    applyBtn.click();
    fixture.detectChanges();

    expect(navigatedExtras).toEqual({
      queryParams: { q: 'zelda' },
    });
  });

  it('gestisce la paginazione IGDB quando count equivale al batch corrente', async () => {
    await setup({ q: 'mario' });

    const firstPage = Array.from({ length: 40 }, (_, idx) => makeGame(idx + 1));
    httpMock
      .expectOne((r) => r.url === '/api/games/' && r.params.get('page') === '1')
      .flush({ count: 40, results: firstPage });
    fixture.detectChanges();

    expect(el.textContent).toContain('40+ giochi trovati');
    const loadMoreBtn = el.querySelector<HTMLButtonElement>('button.btn-outline-primary');
    expect(loadMoreBtn?.textContent).toContain('Carica altri giochi');

    loadMoreBtn!.click();
    fixture.detectChanges();

    const secondPage = Array.from({ length: 10 }, (_, idx) => makeGame(idx + 41));
    httpMock
      .expectOne((r) => r.url === '/api/games/' && r.params.get('page') === '2')
      .flush({ count: 10, results: secondPage });
    fixture.detectChanges();

    expect(el.querySelectorAll('app-game-card').length).toBe(50);
    expect(el.textContent).toContain('50 giochi trovati');
    expect(el.querySelector('button.btn-outline-primary')).toBeNull();
  });

  it('gestisce errore e retry senza perdere la pagina fallita', async () => {
    await setup({ q: 'metroid' });

    httpMock
      .expectOne((r) => r.url === '/api/games/' && r.params.get('page') === '1')
      .flush('Server error', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(el.querySelector('.alert-danger')).toBeTruthy();

    el.querySelector<HTMLButtonElement>('.alert-danger button')!.click();
    fixture.detectChanges();

    httpMock
      .expectOne((r) => r.url === '/api/games/' && r.params.get('page') === '1')
      .flush({ count: 1, results: [makeGame(7)] });
    fixture.detectChanges();

    expect(el.querySelector('.alert-danger')).toBeNull();
    expect(el.querySelectorAll('app-game-card').length).toBe(1);
  });

  it('continua a mostrare i giochi se il caricamento di generi o piattaforme fallisce', async () => {
    await setup({ q: 'halo' }, { failMetadata: true });

    httpMock
      .expectOne((r) => r.url === '/api/games/' && r.params.get('page') === '1')
      .flush({ count: 1, results: [makeGame(99, [6])] });
    fixture.detectChanges();

    expect(el.querySelectorAll('app-game-card').length).toBe(1);
    getFiltersButton().click();
    fixture.detectChanges();

    expect(el.textContent).toContain('Nessun genere disponibile.');
    expect(el.textContent).toContain('Nessuna piattaforma disponibile.');
  });
});
