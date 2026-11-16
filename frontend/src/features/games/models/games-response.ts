import { Game } from './game';

/** A page of search results returned by `GET /api/games/`. */
export interface GamesResponse {
  /** Games in the current page. */
  results: Game[];
  /** Total number of matching games across all pages. */
  count: number;
}
