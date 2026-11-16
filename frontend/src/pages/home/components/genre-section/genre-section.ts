import { Component, computed, input, signal, OnInit, inject, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GameCard } from '../../../../shared/components/game-card/game-card';
import { Games } from '../../../../features/games/services/games';
import { Game } from '../../../../features/games/models/game';
import { Genre } from '../../../../features/games/models/genre';
import { ElementRef } from '@angular/core';
import { OnDestroy } from '@angular/core';
import { AfterViewInit } from '@angular/core';
import { RequestScheduler } from '../../../../features/games/services/request-scheduler';
import { LibraryStore } from '../../../../features/library/services/library-store';

/**
 * Horizontally scrolling row of games for one genre on the home page.
 *
 * Games are loaded lazily: the first page when the section gets close to the
 * viewport, the next ones when the user scrolls near the end of the row.
 * Requests go through RequestScheduler so that many sections loading at once
 * do not exceed the API rate limit.
 */
@Component({
  imports: [GameCard, RouterLink],
  selector: 'app-genre-section',
  styleUrl: './genre-section.scss',
  templateUrl: './genre-section.html',
})
export class GenreSection implements AfterViewInit, OnDestroy {
  private readonly gamesService = inject(Games);
  private readonly requestScheduler = inject(RequestScheduler);
  private destroyed = false;
  /** How many new games (with a cover) to load each time. */
  private readonly targetGames = 8;
  /** Map from platform id to name, for the cards' badges. */
  platformNames = input<Record<number, string>>({});

  /** The genre shown by this section. */
  genre = input.required<Genre>();
  gamesScroller = viewChild<ElementRef<HTMLDivElement>>('gamesScroller');
  sectionElement = viewChild.required<ElementRef<HTMLElement>>('sectionElement');
  games = signal<Game[]>([]);
  isLoading = signal(false);
  hasMore = signal(true);

  private page = 1;
  private readonly pageSize = 40;
  private observer?: IntersectionObserver;

  /** Starts loading once the section is within 400px of the viewport. */
  ngAfterViewInit(): void {
    if (typeof IntersectionObserver === 'undefined') {
      return;
    }
    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          this.observer?.disconnect();
          this.loadNextPage();
        }
      },
      {
        rootMargin: '400px 0px',
      },
    );

    this.observer.observe(this.sectionElement().nativeElement);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.observer?.disconnect();
  }

  /** Loads at least `targetGames` more games, unless already loading or done. */
  loadNextPage(): void {
    if (this.isLoading() || !this.hasMore()) {
      return;
    }

    this.isLoading.set(true);

    const targetCount = this.games().length + this.targetGames;

    this.loadPagesUntil(targetCount);
  }

  /**
   * Fetches pages until the row holds `targetCount` games or there are no more.
   *
   * Games without a cover are skipped, so one page may not be enough.
   */
  private async loadPagesUntil(targetCount: number): Promise<void> {
    if (!this.hasMore()) {
      this.isLoading.set(false);
      return;
    }

    await this.requestScheduler.waitTurn();

    if (this.destroyed) return;

    const currentPage = this.page;

    this.gamesService
      .getGames({
        search: '',
        genres: [this.genre().id],
        metacritic: '50,100',
        page: currentPage,
        page_size: this.pageSize,
      })
      .subscribe({
        next: (response) => {
          const newGames = response.results
            .filter((game) => !!game.cover_url)
            .sort((a, b) => (b.aggregated_rating ?? -1) - (a.aggregated_rating ?? -1));

          this.games.update((current) => [...current, ...newGames]);

          this.page++;

          this.hasMore.set(currentPage * this.pageSize < response.count);

          if (this.games().length < targetCount && this.hasMore()) {
            this.loadPagesUntil(targetCount);
            return;
          }

          this.isLoading.set(false);
        },
        error: (error) => {
          console.error(`Errore nel caricamento del genere ${this.genre().name}:`, error);
          this.isLoading.set(false);
        },
      });
  }

  /**
   * Scrolls the row by 80% of its width.
   *
   * @param direction - `1` to scroll right, `-1` to scroll left.
   */
  scrollGames(direction: number): void {
    const container = this.gamesScroller()?.nativeElement;

    if (!container) {
      return;
    }

    container.scrollBy({
      left: direction * container.clientWidth * 0.8,
      behavior: 'smooth',
    });
  }

  /** Loads more games when the row is scrolled within 300px of its end. */
  onScroll(event: Event): void {
    const element = event.target as HTMLElement;

    const nearEnd = element.scrollLeft + element.clientWidth >= element.scrollWidth - 300;

    if (nearEnd) {
      this.loadNextPage();
    }
  }

  protected readonly library = inject(LibraryStore);

  /** Adds or removes the game from favorites. */
  protected onFavoriteToggle(game: Game): void {
    this.library.toggle('favorites', game);
  }

  /** Adds or removes the game from the wishlist. */
  protected onWishlistToggle(game: Game): void {
    this.library.toggle('wishlist', game);
  }

  /** Platform labels for each game, computed once per change (see GameGrid). */
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
