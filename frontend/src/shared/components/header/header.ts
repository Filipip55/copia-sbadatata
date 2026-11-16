import { Component, signal, inject, computed } from '@angular/core';
import { FormControl, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, filter, switchMap, finalize, startWith } from 'rxjs';
import { Games } from '../../../features/games/services/games';
import { Game } from '../../../features/games/models/game';
import { Genre } from '../../../features/games/models/genre';
import { Platform } from '../../../features/games/models/platform';
import { GameFilters } from '../../../features/games/models/game-filters';
import { of } from 'rxjs';
import { NgClass } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { HostListener } from '@angular/core';
import { DesktopNavigation } from '../desktop-navigation/desktop-navigation';
import { FiltersDropdown } from '../filters-dropdown/filters-dropdown';
import { SearchDropdown } from '../search-dropdown/search-dropdown';
import { AccountDropdown } from '../account-dropdown/account-dropdown';
import { ViewChild, ElementRef } from '@angular/core';
import { AuthService } from '../../../features/auth/services/auth.service';

/** IGDB ids of the platforms offered in the header's filter panel. */
const POPULAR_PLATFORM_IDS = new Set([
  3, // Linux
  6, // PC
  7, // PlayStation
  8, // PlayStation 2
  9, // PlayStation 3
  12, // Xbox 360
  14, // Mac
  34, // Android
  37, // Nintendo 3DS
  39, // iOS
  41, // Wii U
  48, // PlayStation 4
  49, // Xbox One
  130, // Nintendo Switch
  167, // PlayStation 5
  169, // Xbox Series X|S
]);

/**
 * Top bar with navigation, search, filters and account menu.
 *
 * Typing in the search bar shows live results in a dropdown; submitting the
 * search or applying the filters opens the /search-results page. The bar
 * hides while scrolling down, unless one of its dropdowns is open.
 */
@Component({
  imports: [
    ReactiveFormsModule,
    DesktopNavigation,
    FormsModule,
    NgClass,
    FiltersDropdown,
    SearchDropdown,
    AccountDropdown,
  ],
  selector: 'app-header',
  styleUrl: './header.scss',
  templateUrl: './header.html',
})
export class Header {
  /** Selectable release years, from the current one back to 1970. */
  readonly years = Array.from(
    { length: new Date().getFullYear() - 1970 + 1 },
    (_, index) => new Date().getFullYear() - index,
  );

  isSearchOpen = signal(false);
  isFilterOpen = signal(false);
  isAccountOpen = signal(false);
  genres = signal<Genre[]>([]);
  platforms = signal<Platform[]>([]);
  filters = signal<GameFilters>({ search: '' });
  searchResults = signal<Game[]>([]);
  isLoading = signal(false);
  searchControl: FormControl<string> = new FormControl('', { nonNullable: true });
  games = inject(Games);
  router = inject(Router);
  authService = inject(AuthService);
  currentUrl = signal(this.router.url);
  isSearchResultsPage = computed(() => this.currentUrl().startsWith('/search-results'));

  /** Current value of the search field as a signal, used for the query params. */
  private readonly searchValue = toSignal(
    this.searchControl.valueChanges.pipe(startWith(this.searchControl.value)),
    { initialValue: this.searchControl.value },
  );

  /** Query params ready for navigating to /search-results. */
  readonly searchQueryParams = computed(() => {
    const query = this.searchValue().trim();
    const filters = this.filters();
    const hasCriteria = Boolean(
      query ||
      filters.genres?.length ||
      filters.platforms?.length ||
      filters.dates ||
      filters.metacritic,
    );

    const params: Record<string, string> = {};
    if (!hasCriteria) {
      return params;
    }
    if (query) params['q'] = query;
    if (filters.genres?.length) params['genres'] = filters.genres.join(',');
    if (filters.platforms?.length) params['platforms'] = filters.platforms.join(',');
    if (filters.dates) params['dates'] = filters.dates;
    if (filters.metacritic) params['metacritic'] = filters.metacritic;
    if (filters.ordering) params['ordering'] = filters.ordering;
    return params;
  });

  constructor() {
    this.searchControl.valueChanges
      .pipe(
        debounceTime(50),
        distinctUntilChanged(),
        switchMap((value) => {
          const search = value.trim();
          const filters = this.filters();

          const hasFilters = Boolean(
            filters.genres?.length ||
            filters.platforms?.length ||
            filters.dates ||
            filters.metacritic,
          );

          if (!search && !hasFilters) {
            this.searchResults.set([]);
            return of(null);
          }

          this.isFilterOpen.set(false);
          this.searchResults.set([]);
          this.isLoading.set(true);

          return this.games
            .getGames({
              ...filters,
              search,
            })
            .pipe(finalize(() => this.isLoading.set(false)));
        }),
        takeUntilDestroyed(),
      )
      .subscribe({
        next: (response) => {
          if (response) {
            this.searchResults.set(response.results);
          }
        },
      });

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        this.currentUrl.set(event.urlAfterRedirects);
        this.closeSearch();
        this.closeAccount();
        this.closeFilters();
      });
    this.games
      .getGenres()
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (genres) => this.genres.set([...genres].sort((a, b) => a.name.localeCompare(b.name))),
      });
    this.games
      .getPlatforms()
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (platforms) => {
          this.platforms.set(platforms.filter((platform) => POPULAR_PLATFORM_IDS.has(platform.id)).sort((a, b) => a.name.localeCompare(b.name)));
        },
      });
  }

  /** Whether the header is hidden (while scrolling down). */
  isHidden = signal(false);
  private lastScrollY: number = 0;

  @ViewChild('accountButton', { read: ElementRef }) accountButtonRef?: ElementRef<HTMLElement>;
  @ViewChild('searchContainer', { read: ElementRef }) searchContainerRef?: ElementRef<HTMLElement>;
  @ViewChild('filtersButton', { read: ElementRef }) filtersButtonRef?: ElementRef<HTMLElement>;
  @ViewChild('accountDropdown', { read: ElementRef }) accountDropdownRef?: ElementRef<HTMLElement>;
  @ViewChild('searchDropdown', { read: ElementRef }) searchDropdownRef?: ElementRef<HTMLElement>;
  @ViewChild('filtersDropdown', { read: ElementRef }) filtersDropdownRef?: ElementRef<HTMLElement>;

  /**
   * Hides the header when scrolling down and shows it when scrolling up,
   * unless a dropdown is open.
   */
  @HostListener('window:scroll')
  onWindowScroll() {
    const currentScrollY = window.scrollY;
    const difference = currentScrollY - this.lastScrollY;

    if (!this.isSearchOpen() && !this.isAccountOpen() && !this.isFilterOpen()) {
      if (difference > 5) {
        this.isHidden.set(true);
      } else if (difference < -5) {
        this.isHidden.set(false);
      }
    }

    this.lastScrollY = window.scrollY;
  }

  /** Closes any open dropdown when the user clicks outside of it and its toggle button. */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    const target = event.target as Node | null;

    const isInside = (ref?: ElementRef<HTMLElement>): boolean => {
      if (!ref?.nativeElement) return false;
      if (path.length > 0) {
        return path.includes(ref.nativeElement);
      }
      return target ? ref.nativeElement.contains(target) : false;
    };

    // 1. Account dropdown: close if the click is outside both the dropdown and its toggle button
    if (this.isAccountOpen()) {
      const clickedInsideDropdown = isInside(this.accountDropdownRef);
      const clickedToggleButton = isInside(this.accountButtonRef);
      if (!clickedInsideDropdown && !clickedToggleButton) {
        this.closeAccount();
      }
    }

    // 2. Filters dropdown: close if the click is outside both the dropdown and its toggle button
    if (this.isFilterOpen()) {
      const clickedInsideDropdown = isInside(this.filtersDropdownRef);
      const clickedToggleButton = isInside(this.filtersButtonRef);
      if (!clickedInsideDropdown && !clickedToggleButton) {
        this.closeFilters();
      }
    }

    // 3. Search bar and search dropdown: close if the click is outside both of them
    if (this.isSearchOpen()) {
      const clickedInsideSearchContainer = isInside(this.searchContainerRef);
      const clickedInsideSearchDropdown = isInside(this.searchDropdownRef);
      if (!clickedInsideSearchContainer && !clickedInsideSearchDropdown) {
        this.closeSearch();
      }
    }
  }

  /** Closes every dropdown when Escape is pressed. */
  @HostListener('window:keydown.escape')
  onEscape(): void {
    this.closeAccount();
    this.closeFilters();
    this.closeSearch();
  }

  /** Opens or closes the search bar; opening it closes the other dropdowns. */
  toggleSearch(): void {
    const opening = !this.isSearchOpen();
    this.isSearchOpen.set(opening);
    if (opening) {
      this.isHidden.set(false);
      this.isAccountOpen.set(false);
      this.isFilterOpen.set(false);
    }
  }

  /** Focuses the search input as soon as it is rendered. */
  @ViewChild('searchInput')
  set searchInput(input: ElementRef<HTMLInputElement> | undefined) {
    input?.nativeElement.focus();
  }

  /** Opens or closes the filter panel. */
  toggleFilters(): void {
    if (this.isFilterOpen()) {
      this.closeFilters();
    } else {
      this.isFilterOpen.set(true);
      // this.isSearchOpen.set(true);
      this.isAccountOpen.set(false);
      this.isHidden.set(false);
    }
  }

  /** Closes the filter panel. */
  closeFilters(): void {
    if (this.isFilterOpen()) {
      this.isFilterOpen.set(false);
    }
  }

  /** Closes the account menu. */
  closeAccount(): void {
    this.isAccountOpen.set(false);
  }

  /** Opens or closes the account menu; opening it closes the other dropdowns. */
  toggleAccount(): void {
    const opening = !this.isAccountOpen();
    this.isAccountOpen.set(opening);
    if (opening) {
      this.isSearchOpen.set(false);
      this.isFilterOpen.set(false);
      this.isHidden.set(false);
    }
  }

  /** Selected start year for the release date filter. */
  dateFrom = signal('');
  /** Selected end year for the release date filter. */
  dateTo = signal('');

  /**
   * Updates one end of the release year range and rebuilds the `dates` filter.
   *
   * A missing start defaults to 1970-01-01 and a missing end to today.
   */
  updateDateRange(field: 'start' | 'end', value: string): void {
    if (field === 'start') {
      this.dateFrom.set(value);
    } else {
      this.dateTo.set(value);
    }
    const startYear = this.dateFrom();
    const endYear = this.dateTo();

    this.filters.update((current) => {
      const updated = { ...current };

      // No year selected: remove the filter.
      if (!startYear && !endYear) {
        delete updated.dates;
        return updated;
      }

      const today = new Date();
      const todayString = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, '0'),
        String(today.getDate()).padStart(2, '0'),
      ].join('-');

      const startDate = startYear ? `${startYear}-01-01` : '1970-01-01';

      const endDate = endYear ? `${endYear}-12-31` : todayString;

      updated.dates = `${startDate},${endDate}`;

      return updated;
    });
  }

  /**
   * Updates one end of the critic score range.
   *
   * The `metacritic` filter is set only when both ends are filled in.
   */
  updateRatingRange(field: 'min' | 'max', value: string): void {
    this.filters.update((current) => {
      const [min = '', max = ''] = current.metacritic?.split(',') ?? [];

      const rating = {
        min: field === 'min' ? value : min,
        max: field === 'max' ? value : max,
      };

      const updated = { ...current };

      if (rating.min !== '' && rating.max !== '') {
        updated.metacritic = `${rating.min},${rating.max}`;
      } else {
        delete updated.metacritic;
      }

      return updated;
    });
  }

  /** Adds or removes a genre from the filters. */
  toggleGenre(id: number): void {
    this.filters.update((current) => {
      const genres = current.genres ?? [];
      return {
        ...current,
        genres: genres.includes(id) ? genres.filter((genreId) => genreId !== id) : [...genres, id],
      };
    });
  }

  /** Adds or removes a platform from the filters. */
  togglePlatform(id: number): void {
    this.filters.update((current) => {
      const platforms = current.platforms ?? [];
      return {
        ...current,
        platforms: platforms.includes(id)
          ? platforms.filter((platformId) => platformId !== id)
          : [...platforms, id],
      };
    });
  }

  /** Sets the ordering; an empty value removes it. */
  updateOrdering(ordering: GameFilters['ordering'] | ''): void {
    this.filters.update((current) => ({
      ...current,
      ordering: ordering || undefined,
    }));
  }

  /** Closes the search bar and the filter panel, and clears the live results. */
  closeSearch(): void {
    this.isSearchOpen.set(false);
    this.isFilterOpen.set(false);
    this.searchResults.set([]);
  }

  /** Navigates to the results page with the current text and filters. */
  submitSearch(): void {
    const queryParams = this.searchQueryParams();
    if (Object.keys(queryParams).length === 0) {
      return;
    }
    this.closeSearch();
    this.router.navigate(['/search-results'], { queryParams });
  }

  /** Whether any filter or ordering is selected. */
  hasDraftFilters = computed(() => {
    const filters = this.filters();

    return Boolean(
      filters.genres?.length ||
      filters.platforms?.length ||
      filters.dates ||
      filters.metacritic ||
      filters.ordering,
    );
  });

  /** Clears all filters, keeping the search text. */
  resetDraftFilters(): void {
    this.filters.update((current) => ({
      search: current.search ?? '',
    }));

    this.dateFrom.set('');
    this.dateTo.set('');
  }

  /** Closes the filter panel and opens the results page with the current criteria. */
  applyFilters(): void {
    const queryParams = this.searchQueryParams();

    this.closeFilters();
    this.router.navigate(['/search-results'], {
      queryParams,
    });
  }
}
