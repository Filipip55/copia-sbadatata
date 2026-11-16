import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { Game } from '../../../../features/games/models/game';

/** Bootstrap carousel of featured games, using their artwork as background. */
@Component({
  selector: 'app-featured-carousel',
  imports: [RouterLink, DecimalPipe],
  templateUrl: './featured-carousel.html',
  styleUrl: './featured-carousel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeaturedCarousel {
  /** Games to show, one per slide. */
  readonly games = input.required<Game[]>();
  /** Emits the game on the active slide after each slide change. */
  readonly activeGameChange = output<Game>();

  protected readonly carouselId = 'featuredGamesCarousel';

  /** Finds the active slide in the DOM and emits its game. */
  protected onSlideChanged(): void {
    const items = document.querySelectorAll(`#${this.carouselId} .carousel-item`);

    const index = Array.from(items).findIndex((item) => item.classList.contains('active'));

    const game = this.games()[index];

    if (game) {
      this.activeGameChange.emit(game);
    }
  }
}
