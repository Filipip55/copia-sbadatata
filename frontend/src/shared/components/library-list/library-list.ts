import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { Game } from '../../../features/games/models/game';
import { Platform } from '../../../features/games/models/platform';
import { Games } from '../../../features/games/services/games';
import { ListType } from '../../../features/library/models/library';
import { LibraryStore } from '../../../features/library/services/library-store';
import { GameGrid } from '../game-grid/game-grid';

/**
 * Shared content of the Favorites and Wishlist pages.
 * The button for the list on screen removes the game with an "Undo" toast;
 * the other button adds it to or removes it from the other list without a
 * toast (the game stays on this page either way).
 */
@Component({
  selector: 'app-library-list',
  imports: [GameGrid],
  templateUrl: './library-list.html',
  styleUrl: './library-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LibraryList {
  private readonly store = inject(LibraryStore);
  private readonly gamesService = inject(Games);

  /** The list shown by this page. */
  readonly listType = input.required<ListType>();
  /** Page title. */
  readonly heading = input.required<string>();
  /** Text shown when the list is empty. */
  readonly emptyMessage = input.required<string>();
  /** Optional hint below the empty-state message. */
  readonly emptyHint = input<string | null>(null);

  protected readonly games = computed(() => this.store.games(this.listType())());
  protected readonly loading = computed(() => this.store.status() === 'loading');
  protected readonly error = this.store.error;
  protected readonly favoriteIds = this.store.favoriteIds;
  protected readonly wishlistIds = this.store.wishlistIds;

  private readonly platforms = toSignal(
    this.gamesService.getPlatforms().pipe(catchError(() => of<Platform[]>([]))),
    { initialValue: [] as Platform[] },
  );

  /** Map from platform id to name, for the cards' badges. */
  protected readonly platformNames = computed(() => {
    const names: Record<number, string> = {};
    for (const platform of this.platforms()) {
      names[platform.id] = platform.name;
    }
    return names;
  });

  /** Localized game count (e.g. "3 giochi"). */
  protected readonly countLabel = computed(() => {
    const count = this.games().length;
    return count === 1 ? '1 gioco' : `${count} giochi`;
  });

  /** Handles a card's heart or bookmark click (see the class description). */
  protected onToggle(listType: ListType, game: Game): void {
    if (listType === this.listType()) {
      this.store.removeWithUndo(listType, game);
    } else {
      this.store.toggle(listType, game);
    }
  }

  /** Reloads the lists after an error. */
  protected onRetry(): void {
    this.store.reload();
  }
}
