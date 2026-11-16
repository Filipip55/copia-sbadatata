import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Game } from '../../../features/games/models/game';

/**
 * Card for a single game.
 * Presentational component: receives data through inputs and reports user
 * actions through outputs. It calls no services and no backend.
 */
@Component({
  selector: 'app-game-card',
  imports: [DatePipe, RouterLink],
  templateUrl: './game-card.html',
  styleUrl: './game-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameCard {
  /** The game to show (required). */
  readonly game = input.required<Game>();

  /**
   * Already-resolved platform names (e.g. ["PC", "Switch"]).
   * IGDB only provides ids, so the parent passes the labels.
   */
  readonly platformLabels = input<string[]>([]);

  /** How many platforms to show before grouping the rest as "+N". */
  readonly maxPlatforms = input(2);

  /** Whether the game is a favorite (decided by the page, not the card). */
  readonly isFavorite = input(false);

  /** Emitted when the user clicks the heart. The page decides what to do. */
  readonly favoriteToggle = output<Game>();

  /** Whether the game is wishlisted (decided by the page, not the card). */
  readonly isWishlisted = input(false);

  /** Emitted when the user clicks the wishlist bookmark. */
  readonly wishlistToggle = output<Game>();

  /** Becomes true if the cover image fails to load. */
  protected readonly coverFailed = signal(false);

  /** Whether to show the cover image instead of the placeholder. */
  protected readonly showCover = computed(() => !!this.game().cover_url && !this.coverFailed());

  /** IGDB returns a Unix timestamp in seconds; Date expects milliseconds. */
  protected readonly releaseDate = computed(() => {
    const ts = this.game().first_release_date;
    return ts ? new Date(ts * 1000) : null;
  });

  /** Critic score (0-100), the equivalent of a Metascore. */
  protected readonly criticScore = computed(() => this.round(this.game().aggregated_rating));

  /** Platforms shown as badges. */
  protected readonly visiblePlatforms = computed(() =>
    this.platformLabels().slice(0, this.maxPlatforms()),
  );

  /** Number of platforms grouped in the "+N" badge. */
  protected readonly hiddenPlatformCount = computed(() =>
    Math.max(0, this.platformLabels().length - this.maxPlatforms()),
  );

  protected onFavoriteClick(): void {
    this.favoriteToggle.emit(this.game());
  }

  protected onWishlistClick(): void {
    this.wishlistToggle.emit(this.game());
  }

  /** Rounds a score, keeping `null`/`undefined` as `null`. */
  private round(value: number | undefined | null): number | null {
    return value == null ? null : Math.round(value);
  }
}
