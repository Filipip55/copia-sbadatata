import { ChangeDetectionStrategy, Component } from '@angular/core';
import { LibraryList } from '../../shared/components/library-list/library-list';

/** Wishlist page: games the user wants to play. */
@Component({
  imports: [LibraryList],
  selector: 'app-wishlist',
  styleUrl: './wishlist.scss',
  templateUrl: './wishlist.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Wishlist {}
