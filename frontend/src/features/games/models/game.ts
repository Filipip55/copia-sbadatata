/**
 * A game as returned by the search endpoint and shown in game cards.
 *
 * Unlike {@link GameDetail}, genres and platforms are plain IGDB ids.
 */
export interface Game {
  id: number;
  name: string;
  slug: string;
  /** IGDB user rating (0-100). */
  rating?: number;
  /** Critic rating (0-100), the equivalent of a Metascore. */
  aggregated_rating?: number;
  /** Unix timestamp in seconds. */
  first_release_date?: number;
  genres: number[];
  platforms: number[];
  cover_url: string | null;
  /** Full-size artwork URLs, used as carousel backgrounds. */
  artwork_urls?: string[];
}
