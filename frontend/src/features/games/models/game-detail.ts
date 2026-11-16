import { Platform } from './platform';
import { Genre } from './genre';
import { Publisher } from './publisher';
import { Screenshot } from './screenshot';
import { InvolvedCompany } from './involved-company';

/** Full game details, as returned by `GET /api/games/:id/`. */
export interface GameDetail {
  id: number;
  slug: string;
  name: string;
  summary: string | null;
  /** Critic rating (0-100). */
  aggregated_rating: number | null;
  /** Unix timestamp in seconds. */
  first_release_date: number | null;
  cover_url: string | null;
  platforms: Platform[];
  genres: Genre[];
  publishers: Publisher[];
  /** IGDB user rating (0-100). */
  rating: number | null;
  screenshots: Screenshot[];
  /** ISO 8601 timestamp of the last refresh from IGDB. */
  cached_at: string;
  artwork_urls: string[];
  involved_companies: InvolvedCompany[];
}
