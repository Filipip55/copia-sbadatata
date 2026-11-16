import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Genre } from '../../../features/games/models/genre';
import { GameFilters } from '../../../features/games/models/game-filters';
import { Platform } from '../../../features/games/models/platform';

/**
 * Filter panel (genres, platforms, release years, critic score and ordering).
 *
 * Presentational component: the parent owns the draft filters and applies
 * the changes reported through the outputs.
 */
@Component({
  selector: 'app-filters-dropdown',
  imports: [FormsModule],
  templateUrl: './filters-dropdown.html',
  styleUrl: './filters-dropdown.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FiltersDropdown {
  /** Current (draft) filters, used to mark selected options. */
  filters = input.required<GameFilters>();
  genres = input.required<Genre[]>();
  platforms = input.required<Platform[]>();
  /** Selectable release years, newest first. */
  years = input.required<number[]>();
  /** Selected start year, or an empty string. */
  dateFrom = input.required<string>();
  /** Selected end year, or an empty string. */
  dateTo = input.required<string>();

  /** Emits the id of a genre to add or remove. */
  toggleGenre = output<number>();
  /** Emits the id of a platform to add or remove. */
  togglePlatform = output<number>();

  /** Emitted when the user clears all filters. */
  resetFilters = output<void>();
  /** Emitted when the user applies the filters. */
  applyFilters = output<void>();

  /** Emits a change to the start or end year. */
  updateDateRange = output<{
    type: 'start' | 'end';
    value: string;
  }>();

  /** Emits a change to the minimum or maximum critic score. */
  updateRatingRange = output<{
    type: 'min' | 'max';
    value: string;
  }>();

  /** Emits the selected ordering. */
  updateOrdering = output<GameFilters['ordering']>();
}
