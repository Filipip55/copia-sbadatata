import { Component, input, output, inject } from '@angular/core';
import { Game } from '../../../features/games/models/game';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';

/** Dropdown under the header's search bar with live search results. */
@Component({
  selector: 'app-search-dropdown',
  imports: [DatePipe, DecimalPipe, RouterLink],
  templateUrl: './search-dropdown.html',
  styleUrl: './search-dropdown.scss',
})
export class SearchDropdown {
  /** Games matching the current query. */
  results = input.required<Game[]>();
  /** True while results are loading. */
  loading = input(false);
  /** Query params for the /search-results page (e.g. { q: 'zelda', genres: '4' }). */
  queryParams = input<Record<string, string>>({});
  /** Emitted when the user clicks "See all results". */
  viewAll = output<void>();
  router = inject(Router);

  //   gameSelected = output<Game>();

  /** Opens the detail page of the selected game. */
  selectGame(game: Game): void {
    this.router.navigate(['/games', game.id]);
  }
}
