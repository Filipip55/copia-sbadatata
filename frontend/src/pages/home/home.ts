import { Component, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';

import { FeaturedCarousel } from './components/featured-carousel/featured-carousel';
import { GenreSection } from './components/genre-section/genre-section';
import { Genre } from '../../features/games/models/genre';
import { Games } from '../../features/games/services/games';
import { Game } from '../../features/games/models/game';

/**
 * Home page: a carousel of featured games plus one section per genre.
 *
 * The featured games are top-rated games (critic score 70+) with artwork,
 * taken from a random genre or platform; if there are fewer than five, they
 * are taken from the whole catalog instead.
 */
@Component({
  imports: [FeaturedCarousel, GenreSection],
  selector: 'app-home',
  styleUrl: './home.scss',
  templateUrl: './home.html',
})
export class Home {
  private readonly gamesService = inject(Games);
  protected readonly isLoading = signal(true);
  protected readonly featuredGames = signal<Game[]>([]);
  /** Map from platform id to name, for the cards' badges. */
  protected readonly platformNames = signal<Record<number, string>>({});
  /** Genres shown as sections, sorted by name. */
  genres = signal<Genre[]>([]);

  constructor() {
    forkJoin({
      genres: this.gamesService.getGenres(),
      platforms: this.gamesService.getPlatforms(),
    }).subscribe(({ genres, platforms }) => {
      const useGenre = Math.random() < 0.5;
      const options = useGenre ? genres : platforms;

      this.platformNames.set(
        Object.fromEntries(platforms.map((platform) => [platform.id, platform.name])),
      );

      if (!options.length) return;

      const selected = options[Math.floor(Math.random() * options.length)];

      this.gamesService
        .getGames({
          search: '',
          ...(useGenre ? { genres: [selected.id] } : { platforms: [selected.id] }),
          metacritic: '70,100',
          page: 1,
          page_size: 40,
        })
        .subscribe((response) => {
          const gamesWithImages = response.results.filter((game) => game.artwork_urls?.length);

          if (gamesWithImages.length < 5) {
            this.gamesService
              .getGames({
                search: '',
                metacritic: '70,100',
                page: 1,
                page_size: 40,
              })
              .subscribe((fallback) => {
                const fallbackGames = fallback.results.filter((game) => game.artwork_urls?.length);

                const shuffled = [...fallbackGames].sort(() => Math.random() - 0.5);

                this.featuredGames.set(shuffled.slice(0, 5));
                this.isLoading.set(false);
              });

            return;
          }

          const shuffled = [...gamesWithImages].sort(() => Math.random() - 0.5);

          this.featuredGames.set(shuffled.slice(0, 5));
          this.isLoading.set(false);
        });
    });
  }

  /** Loads the genres and sorts them alphabetically. */
  loadGenres(): void {
    this.gamesService.getGenres().subscribe({
      next: (genres) => {
        this.genres.set([...genres].sort((a, b) => a.name.localeCompare(b.name)));
      },
      error: (error) => {
        console.error('Errore nel caricamento dei generi:', error);
      },
    });
  }

  ngOnInit(): void {
    this.loadGenres();
  }
}
