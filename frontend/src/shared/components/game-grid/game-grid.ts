import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { GameCard } from '../game-card/game-card';
import { Game } from '../../../features/games/models/game';

/**
 * Reusable game grid (search results, Favorites, Wishlist).
 * Presentational component: receives data and state from the page, shows
 * the cards and forwards user actions through outputs.
 */
@Component({
  selector: 'app-game-grid',
  imports: [GameCard],
  templateUrl: './game-grid.html',
  styleUrl: './game-grid.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameGrid {
  /** The games to show. */
  readonly games = input<Game[]>([]);

  /** True while the page is loading data. */
  readonly loading = input(false);

  /** Error message; when set, the grid shows an alert with a "Retry" button. */
  readonly error = input<string | null>(null);

  /** Text shown when there are no results. */
  readonly emptyMessage = input('Nessun gioco trovato.');

  /** Optional hint below the empty-state message. */
  readonly emptyHint = input<string | null>(null);

  /** Map from IGDB platform id to short name (e.g. 130 → "Switch"). */
  readonly platformNames = input<Record<number, string>>({});

  /** Ids of favorite games, to highlight the cards' heart icon. */
  readonly favoriteIds = input<ReadonlySet<number>>(new Set());

  /** Ids of wishlisted games, to highlight the cards' bookmark icon. */
  readonly wishlistIds = input<ReadonlySet<number>>(new Set());

  /** How many skeleton cards to show during the first load. */
  readonly skeletonCount = input(8);

  /** Whether more pages of results can be loaded. */
  readonly hasMore = input(false);

  /** Emitted when a card's heart is clicked. */
  readonly favoriteToggle = output<Game>();
  /** Emitted when a card's bookmark is clicked. */
  readonly wishlistToggle = output<Game>();
  /** Emitted when the user clicks "Retry". */
  readonly retry = output<void>();
  /** Emitted when the user asks for the next page. */
  readonly loadMore = output<void>();

  /** First load: no games yet, so show skeleton cards. */
  protected readonly showSkeletons = computed(
    () => this.loading() && this.games().length === 0 && !this.error(),
  );

  /** Whether to show the empty-state message. */
  protected readonly showEmpty = computed(
    () => !this.loading() && !this.error() && this.games().length === 0,
  );

  protected readonly skeletons = computed(() => Array.from({ length: this.skeletonCount() }));

  /**
   * Platform labels for each game, computed once whenever the games or the
   * name map change. Computing them with a function call in the template
   * would create new arrays on every change detection run, needlessly
   * re-rendering the (OnPush) cards.
   */
  protected readonly labelsByGame = computed(() => {
    const names = this.platformNames();
    return new Map(
      this.games().map((game) => [
        game.id,
        game.platforms.map((id) => names[id]).filter((name): name is string => !!name),
      ]),
    );
  });

  /** Returns the platform labels for a game. */
  protected labelsFor(game: Game): string[] {
    return this.labelsByGame().get(game.id) ?? [];
  }
}
