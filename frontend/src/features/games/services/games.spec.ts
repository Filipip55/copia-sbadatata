import { TestBed } from '@angular/core/testing';
import { Games } from './games';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { GameFilters } from '../models/game-filters';

describe('Games', () => {
  let service: Games;
  let httpTestingController: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(Games);
    httpTestingController = TestBed.inject(HttpTestingController);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
  it('should inject httpTestingController', () => {
    expect(httpTestingController).toBeTruthy();
  });
  it('should send a GET request with search', () => {
    const filters: GameFilters = {
      search: 'zelda',
    };

    service.getGames(filters).subscribe();

    const request = httpTestingController.expectOne((req) => req.url === '/api/games/');

    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('search')).toBe('zelda');

    // request.flush({
    //   results: [],
    //   count: 0
    // });
  });
});
