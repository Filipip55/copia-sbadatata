import { Component, inject, signal, computed } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Games } from '../../features/games/services/games';
import { Game } from '../../features/games/models/game';
import { GameDetail } from '../../features/games/models/game-detail';
import { DecimalPipe } from '@angular/common';
import { LibraryStore } from '../../features/library/services/library-store';

/** Game detail page (`/games/:gameId`), with favorite and wishlist buttons. */
@Component({
  imports: [DecimalPipe],
  selector: 'app-game-detail-page',
  styleUrl: './game-detail-page.scss',
  templateUrl: './game-detail-page.html',
})
export class GameDetailPage {
  private route = inject(ActivatedRoute);
  private gamesService = inject(Games);
  private libraryStore = inject(LibraryStore);

  game = signal<GameDetail | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  isFavorite = computed(() => {
    const game = this.game();
    return game ? this.libraryStore.favoriteIds().has(game.id) : false;
  });

  isInWishlist = computed(() => {
    const game = this.game();
    return game ? this.libraryStore.wishlistIds().has(game.id) : false;
  });

  /** Names of the companies that developed the game. */
  developers = computed(
    () =>
      this.game()
        ?.involved_companies.filter((company) => company.developer)
        .map((company) => company.name) ?? [],
  );

  /** Names of the companies that published the game. */
  publishers = computed(
    () =>
      this.game()
        ?.involved_companies.filter((company) => company.publisher)
        .map((company) => company.name) ?? [],
  );

  /** Converts the details to the `Game` shape stored in the personal lists. */
  private toGame(game: GameDetail): Game {
    return {
      id: game.id,
      name: game.name,
      slug: game.slug,
      rating: game.rating ?? undefined,
      aggregated_rating: game.aggregated_rating ?? undefined,
      first_release_date: game.first_release_date ?? undefined,
      genres: game.genres.map((genre) => genre.id),
      platforms: game.platforms.map((platform) => platform.id),
      cover_url: game.cover_url,
      artwork_urls: game.artwork_urls,
    };
  }

  /** Adds or removes the game from favorites. */
  toggleFavorite(): void {
    const game = this.game();
    if (!game) return;

    this.libraryStore.toggle('favorites', this.toGame(game));
  }

  /** Adds or removes the game from the wishlist. */
  toggleWishlist(): void {
    const game = this.game();
    if (!game) return;

    this.libraryStore.toggle('wishlist', this.toGame(game));
  }

  /** Loads the game whenever the `gameId` route parameter changes. */
  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const gameId = Number(params.get('gameId'));

      if (!Number.isInteger(gameId) || gameId <= 0) {
        this.error.set('Invalid game ID');
        this.loading.set(false);
        return;
      }

      this.game.set(null);
      this.loading.set(true);
      this.error.set(null);

      this.gamesService.getGameDetail(gameId).subscribe({
        next: (game) => {
          console.log('Game detail:', game);
          this.game.set(game);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Impossible to load game details');
          this.loading.set(false);
        },
      });
    });
  }
}
