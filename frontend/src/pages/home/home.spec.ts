import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Home } from './home';

describe('Home', () => {
  let component: Home;
  let fixture: ComponentFixture<Home>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Home);
    component = fixture.componentInstance;

    // Handle constructor forkJoin
    const genresReq = httpMock.expectOne('/api/genres/');
    const platformsReq = httpMock.expectOne('/api/platforms/');
    genresReq.flush([{ id: 2, name: 'Point-and-click', slug: 'point-and-click' }]);
    platformsReq.flush([{ id: 6, name: 'PC', slug: 'pc' }]);

    // Handle getGames for featured games in constructor (5 games to satisfy threshold)
    const gamesReq = httpMock.expectOne((r) => r.url === '/api/games/');
    gamesReq.flush({
      count: 5,
      results: [1, 2, 3, 4, 5].map((id) => ({
        id,
        name: `Game ${id}`,
        slug: `game-${id}`,
        genres: [2],
        platforms: [6],
        cover_url: 'http://example.com/cover.jpg',
        artwork_urls: ['http://example.com/art.jpg'],
      })),
    });

    fixture.detectChanges();

    // Handle ngOnInit loadGenres
    const initGenresReq = httpMock.expectOne('/api/genres/');
    initGenresReq.flush([{ id: 2, name: 'Point-and-click', slug: 'point-and-click' }]);

    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders genre sections with genres loaded', () => {
    expect(component.genres().length).toBe(1);
    expect(component.genres()[0].name).toBe('Point-and-click');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-genre-section')).toBeTruthy();
  });
});
