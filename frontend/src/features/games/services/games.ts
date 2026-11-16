import { Service, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { GamesResponse } from '../models/games-response';
import { GameDetail } from '../models/game-detail';
import { GameFilters } from '../models/game-filters';
import { Game } from '../models/game';
import { Genre } from '../models/genre';
import { Platform } from '../models/platform';
import { map } from 'rxjs';

/** HTTP client for the games, genres and platforms endpoints. */
@Service()
export class Games {
  private readonly http = inject(HttpClient);

  /**
   * Sorts games client-side by the given key; missing values go last.
   *
   * @returns A sorted copy, or the original array if no ordering is given.
   */
  private sortGames(games: Game[], ordering?: GameFilters['ordering']): Game[] {
    if (!ordering) {
      return games;
    }

    const direction = ordering.startsWith('-') ? -1 : 1;

    const compareNumbers = (a: number | null | undefined, b: number | null | undefined): number => {
      if (a == null) return b == null ? 0 : 1;
      if (b == null) return -1;

      return (a - b) * direction;
    };

    return [...games].sort((a, b) => {
      switch (ordering) {
        case 'name':
        case '-name':
          return a.name.localeCompare(b.name, 'it', { sensitivity: 'base' }) * direction;

        case 'first_release_date':
        case '-first_release_date':
          return compareNumbers(a.first_release_date, b.first_release_date);

        case 'aggregated_rating':
        case '-aggregated_rating':
          return compareNumbers(a.aggregated_rating, b.aggregated_rating);
      }
    });
  }

  /**
   * Searches games with the given filters and pagination.
   *
   * Ordering is applied client-side, within the returned page only.
   *
   * @param filters - Search text, filters, pagination and ordering.
   * @returns The requested page of results and the total count.
   */
  getGames(filters: GameFilters): Observable<GamesResponse> {
    let params = new HttpParams();

    params = params.set('search', filters.search);
    if (filters.genres?.length) {
      params = params.set('genres', filters.genres.join(','));
    }
    if (filters.platforms?.length) {
      params = params.set('platforms', filters.platforms.join(','));
    }
    if (filters.dates !== undefined) {
      params = params.set('dates', filters.dates);
    }
    if (filters.metacritic !== undefined) {
      params = params.set('metacritic', filters.metacritic);
    }
    if (filters.page !== undefined) {
      params = params.set('page', filters.page);
    }
    if (filters.page_size !== undefined) {
      params = params.set('page_size', filters.page_size);
    }

    return this.http
      .get<GamesResponse>('/api/games/', {
        params: params,
      })
      .pipe(
        map((response) => ({
          ...response,
          results: this.sortGames(response.results, filters.ordering),
        })),
      );
  }

  /**
   * Fetches a game's full details.
   *
   * As a side effect, the backend caches the game in its Game table,
   * which is required before adding it to a personal list.
   */
  getGameDetail(gameId: number): Observable<GameDetail> {
    return this.http.get<GameDetail>(`/api/games/${gameId}/`);
  }

  /** Fetches all genres. */
  getGenres(): Observable<Genre[]> {
    return this.http.get<Genre[]>('/api/genres/');
  }

  /** Fetches all platforms. */
  getPlatforms(): Observable<Platform[]> {
    return this.http.get<Platform[]>('/api/platforms/');
  }
}
