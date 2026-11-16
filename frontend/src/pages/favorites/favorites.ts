import { ChangeDetectionStrategy, Component } from '@angular/core';
import { LibraryList } from '../../shared/components/library-list/library-list';

/** Favorites page: the user's favorite games. */
@Component({
  imports: [LibraryList],
  selector: 'app-favorites',
  styleUrl: './favorites.scss',
  templateUrl: './favorites.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Favorites {}
