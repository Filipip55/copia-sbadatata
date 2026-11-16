import { Game } from '../../games/models/game';

/** Available personal lists (same values as `list_type` in the backend). */
export type ListType = 'favorites' | 'wishlist';

/** All list types, in display order. */
export const LIST_TYPES: readonly ListType[] = ['favorites', 'wishlist'];

/** A game in a list, with the time it was added. */
export interface LibraryEntry {
  readonly game: Game;
  /** ISO 8601 date. */
  readonly addedAt: string;
}

/** The entries of every list, keyed by list type. */
export type LibraryLists = Record<ListType, readonly LibraryEntry[]>;

/** A list entry as returned by `GET`/`PUT /api/library/`. */
export interface LibraryEntryResponse {
  list_type: ListType;
  added_at: string;
  game: StoredGame;
}

/**
 * A game saved in Django's Game table (or a GameDetail): unlike search
 * results, platforms and genres may be objects instead of ids.
 */
export interface StoredGame {
  id: number;
  slug: string;
  name: string;
  cover_url: string | null;
  rating?: number | null;
  aggregated_rating?: number | null;
  first_release_date?: number | null;
  platforms?: ReadonlyArray<number | { id: number }> | null;
  genres?: ReadonlyArray<number | { id: number }> | null;
}

/** Returns a fresh object with every list empty. */
export function emptyLists(): LibraryLists {
  return { favorites: [], wishlist: [] };
}

/**
 * Converts a stored game (or a GameDetail) to the `Game` shape used by the
 * cards. Also used by the detail page to add the game to a list.
 */
export function toGame(stored: StoredGame): Game {
  return {
    id: stored.id,
    slug: stored.slug,
    name: stored.name,
    cover_url: stored.cover_url ?? '',
    rating: stored.rating ?? undefined,
    aggregated_rating: stored.aggregated_rating ?? undefined,
    first_release_date: stored.first_release_date ?? undefined,
    platforms: toIds(stored.platforms),
    genres: toIds(stored.genres),
  };
}

/** Normalizes a list of ids or `{ id }` objects to plain ids, dropping invalid values. */
function toIds(values: StoredGame['platforms']): number[] {
  return (values ?? [])
    .map((value) => (typeof value === 'number' ? value : value?.id))
    .filter((id): id is number => typeof id === 'number');
}
