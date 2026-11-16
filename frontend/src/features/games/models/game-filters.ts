/** Sort keys for search results; a leading `-` means descending order. */
export type GameOrdering =
  | 'name'
  | '-name'
  | 'first_release_date'
  | '-first_release_date'
  | 'aggregated_rating'
  | '-aggregated_rating';

/** Search text, filters, pagination and ordering for `Games.getGames`. */
export interface GameFilters {
  search: string;
  /** IGDB genre ids. */
  genres?: number[];
  /** IGDB platform ids. */
  platforms?: number[];
  /** Release date range, formatted as `"YYYY-MM-DD,YYYY-MM-DD"`. */
  dates?: string;
  /** Critic rating range, formatted as `"min,max"` (0-100). */
  metacritic?: string;
  /** Page number, starting from 1. */
  page?: number;
  /** Results per page (the backend allows at most 40). */
  page_size?: number;
  /** Client-side ordering, applied to each page after it is fetched. */
  ordering?: GameOrdering;
}
