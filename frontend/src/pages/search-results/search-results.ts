import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { EMPTY, Subject, catchError, map, of, startWith, switchMap, tap } from 'rxjs';
import { Game } from '../../features/games/models/game';
import { GameFilters, GameOrdering } from '../../features/games/models/game-filters';
import { GamesResponse } from '../../features/games/models/games-response';
import { Genre } from '../../features/games/models/genre';
import { Platform } from '../../features/games/models/platform';
import { Games } from '../../features/games/services/games';
import { FiltersDropdown } from '../../shared/components/filters-dropdown/filters-dropdown';
import { GameGrid } from '../../shared/components/game-grid/game-grid';
import { LibraryStore } from '../../features/library/services/library-store';

const PAGE_SIZE = 40;
const MIN_RELEASE_YEAR = 1970;
const DATE_PARAM_PATTERN = /^(\d{4})-\d{2}-\d{2}$/;

/**
 * Subset of major platforms offered in the page's filters.
 * The `platformNames` map still holds the whole catalog, so the cards of
 * older or less common games get the right badges.
 */
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

/** Accepted values of the `ordering` query param. */
const VALID_ORDERINGS = new Set<GameOrdering>([
  'name',
  '-name',
  'first_release_date',
  '-first_release_date',
  'aggregated_rating',
  '-aggregated_rating',
]);

/** Search text and filters, without pagination. */
type SearchCriteria = Omit<GameFilters, 'page' | 'page_size'>;

const EMPTY_CRITERIA: SearchCriteria = { search: '' };

/**
 * Parses a comma-separated list of positive ids, removing duplicates.
 *
 * @returns The ids, or `undefined` if there are none.
 */
function parseIdList(raw: string | null): number[] | undefined {
  if (!raw) return undefined;
  const ids = raw
    .split(',')
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);
  return ids.length > 0 ? Array.from(new Set(ids)) : undefined;
}

/** Returns the ordering if it is valid, `undefined` otherwise. */
function parseOrdering(raw: string | null): GameOrdering | undefined {
  if (raw && VALID_ORDERINGS.has(raw as GameOrdering)) {
    return raw as GameOrdering;
  }
  return undefined;
}

/** Reads the search criteria from the URL query params. */
function parseCriteria(params: ParamMap): SearchCriteria {
  return {
    search: (params.get('q') ?? '').trim(),
    genres: parseIdList(params.get('genres')),
    platforms: parseIdList(params.get('platforms')),
    dates: params.get('dates')?.trim() || undefined,
    metacritic: params.get('metacritic')?.trim() || undefined,
    ordering: parseOrdering(params.get('ordering')),
  };
}

/** Whether there is search text or at least one filter (ordering excluded). */
function hasSearchCriteria(criteria: SearchCriteria): boolean {
  return Boolean(
    criteria.search ||
    criteria.genres?.length ||
    criteria.platforms?.length ||
    criteria.dates ||
    criteria.metacritic,
  );
}

/**
 * Extracts the start and end years from a `"YYYY-MM-DD,YYYY-MM-DD"` range.
 *
 * Years outside 1970..`maxYear` become empty strings.
 */
function parseDateYears(raw: string | undefined, maxYear: number): { from: string; to: string } {
  if (!raw) {
    return { from: '', to: '' };
  }
  const [startRaw = '', endRaw = ''] = raw.split(',');
  const extractYear = (dateStr: string): string => {
    const match = DATE_PARAM_PATTERN.exec(dateStr.trim());
    if (!match) return '';
    const year = Number(match[1]);
    return year >= MIN_RELEASE_YEAR && year <= maxYear ? match[1] : '';
  };

  return {
    from: extractYear(startRaw),
    to: extractYear(endRaw),
  };
}

/**
 * The backend (and IGDB) always require a full "YYYY-MM-DD,YYYY-MM-DD" range.
 * If the user fills in only one end, the other is completed with the catalog
 * limits, and swapped years are put back in order to avoid empty results.
 */
function buildDatesParam(fromYear: string, toYear: string): string | undefined {
  if (!fromYear && !toYear) {
    return undefined;
  }

  let startYear = fromYear;
  let endYear = toYear;
  if (startYear && endYear && Number(startYear) > Number(endYear)) {
    [startYear, endYear] = [endYear, startYear];
  }

  const today = new Date();
  const todayString = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');

  const startDate = startYear ? `${startYear}-01-01` : `${MIN_RELEASE_YEAR}-01-01`;
  const endDate = endYear ? `${endYear}-12-31` : todayString;
  return `${startDate},${endDate}`;
}

/** Parses a critic score bound, clamped to 0-100 and rounded; `null` if empty or invalid. */
function parseRatingBound(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

/** Splits a `"min,max"` critic score range into its (normalized) bounds. */
function parseRatingRange(raw: string | undefined): { min: string; max: string } {
  if (!raw) {
    return { min: '', max: '' };
  }
  const [minRaw = '', maxRaw = ''] = raw.split(',');
  const min = parseRatingBound(minRaw);
  const max = parseRatingBound(maxRaw);
  return {
    min: min === null ? '' : String(min),
    max: max === null ? '' : String(max),
  };
}

/**
 * The backend also requires a "min,max" pair for the critic score.
 * A missing bound defaults to 0 or 100, so filling in a single field works too.
 */
function buildMetacriticParam(minRaw: string, maxRaw: string): string | undefined {
  const min = parseRatingBound(minRaw);
  const max = parseRatingBound(maxRaw);
  if (min === null && max === null) {
    return undefined;
  }

  let low = min ?? 0;
  let high = max ?? 100;
  if (low > high) {
    [low, high] = [high, low];
  }
  return `${low},${high}`;
}

/** Converts search criteria to URL query params (empty if there are no criteria). */
function buildQueryParams(criteria: SearchCriteria): Record<string, string> {
  if (!hasSearchCriteria(criteria)) {
    return {};
  }

  const params: Record<string, string> = {};
  if (criteria.search) params['q'] = criteria.search;
  if (criteria.genres?.length) params['genres'] = criteria.genres.join(',');
  if (criteria.platforms?.length) params['platforms'] = criteria.platforms.join(',');
  if (criteria.dates) params['dates'] = criteria.dates;
  if (criteria.metacritic) params['metacritic'] = criteria.metacritic;
  if (criteria.ordering) params['ordering'] = criteria.ordering;
  return params;
}

/**
 * Search results page.
 * The URL query params are the single source of truth, so header searches,
 * newly applied filters and back/forward navigation all stay in sync.
 */
@Component({
  selector: 'app-search-results',
  imports: [GameGrid, FiltersDropdown],
  templateUrl: './search-results.html',
  styleUrl: './search-results.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchResults {
  private readonly filtersWrapper = viewChild<ElementRef<HTMLElement>>('filtersWrapper');
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly gamesService = inject(Games);
  protected readonly library = inject(LibraryStore);

  private readonly currentYear = new Date().getFullYear();

  /** Selectable release years for the filter dropdown, newest first. */
  protected readonly filterYears = Array.from(
    { length: this.currentYear - MIN_RELEASE_YEAR + 1 },
    (_, index) => this.currentYear - index,
  );

  private readonly platformsList = toSignal(
    this.gamesService.getPlatforms().pipe(catchError(() => of<Platform[]>([]))),
    { initialValue: [] as Platform[] },
  );

  protected readonly availableGenres = toSignal(
    this.gamesService.getGenres().pipe(catchError(() => of<Genre[]>([]))),
    { initialValue: [] as Genre[] },
  );

  private readonly criteria = signal<SearchCriteria>(EMPTY_CRITERIA);

  protected readonly games = signal<Game[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly hasMore = signal(false);
  protected readonly totalCount = signal(0);
  /** False when the total is only a lower bound (more pages may exist). */
  protected readonly countIsExact = signal(true);
  protected readonly isFiltersOpen = signal(false);

  // Draft state of the filter controls: freely editable before pressing "Apply filters".
  protected readonly draftGenres = signal<number[]>([]);
  protected readonly draftPlatforms = signal<number[]>([]);
  protected readonly draftDateFrom = signal('');
  protected readonly draftDateTo = signal('');
  protected readonly draftRatingMin = signal('');
  protected readonly draftRatingMax = signal('');
  protected readonly draftOrdering = signal<GameOrdering | ''>('');

  protected readonly searchQuery = computed(() => this.criteria().search);
  protected readonly hasCriteria = computed(() => hasSearchCriteria(this.criteria()));

  /** Full id → name map, to show every platform on the result cards. */
  protected readonly platformNames = computed(() => {
    const names: Record<number, string> = {};
    for (const platform of this.platformsList()) {
      names[platform.id] = platform.name;
    }
    return names;
  });

  /** Platforms offered in the filter panel, including any id already selected in the URL. */
  protected readonly filterPlatforms = computed(() => {
    const all = this.platformsList();
    const selectedIds = new Set([...(this.criteria().platforms ?? []), ...this.draftPlatforms()]);
    const filtered = all.filter(
      (platform) => POPULAR_PLATFORM_IDS.has(platform.id) || selectedIds.has(platform.id),
    );
    return filtered.length > 0 ? filtered : all;
  });

  /** Total number of filters currently applied (search text excluded). */
  protected readonly activeFilterCount = computed(() => {
    const active = this.criteria();
    return (
      (active.genres?.length ?? 0) +
      (active.platforms?.length ?? 0) +
      (active.dates ? 1 : 0) +
      (active.metacritic ? 1 : 0) +
      (active.ordering ? 1 : 0)
    );
  });

  /** Whether any draft filter or ordering is selected. */
  protected readonly hasDraftFilters = computed(() =>
    Boolean(
      this.draftGenres().length ||
      this.draftPlatforms().length ||
      this.draftDateFrom() ||
      this.draftDateTo() ||
      this.draftRatingMin().trim() ||
      this.draftRatingMax().trim() ||
      this.draftOrdering(),
    ),
  );

  /** Draft state shaped as GameFilters for the FiltersDropdown component. */
  protected readonly draftFilters = computed<GameFilters>(() => {
    const min = this.draftRatingMin().trim();
    const max = this.draftRatingMax().trim();
    const metacritic = min !== '' || max !== '' ? `${min},${max}` : undefined;

    return {
      search: this.criteria().search,
      genres: this.draftGenres(),
      platforms: this.draftPlatforms(),
      dates: buildDatesParam(this.draftDateFrom(), this.draftDateTo()),
      metacritic,
      ordering: this.draftOrdering() || undefined,
    };
  });

  private lastLoadedPage = 0;
  private failedPage: number | null = null;
  private readonly pageTrigger$ = new Subject<number>();

  constructor() {
    // The outer switchMap cancels outdated requests when the criteria change;
    // the inner catchError returns EMPTY so the stream survives for later retries.
    this.route.queryParamMap
      .pipe(
        map(parseCriteria),
        switchMap((criteria) => {
          this.resetForCriteria(criteria);
          if (!hasSearchCriteria(criteria)) {
            return EMPTY;
          }

          return this.pageTrigger$.pipe(
            startWith(1),
            switchMap((page) => this.fetchPage(criteria, page)),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  /** Resets results, pagination and errors for new search criteria. */
  private resetForCriteria(criteria: SearchCriteria): void {
    this.criteria.set(criteria);
    this.syncDraftWithCriteria(criteria);
    this.isFiltersOpen.set(false);
    this.lastLoadedPage = 0;
    this.failedPage = null;
    this.games.set([]);
    this.totalCount.set(0);
    this.countIsExact.set(true);
    this.hasMore.set(false);
    this.error.set(null);
    this.loading.set(false);
  }

  /** Copies the applied criteria into the draft filter controls. */
  private syncDraftWithCriteria(criteria: SearchCriteria): void {
    const years = parseDateYears(criteria.dates, this.currentYear);
    const rating = parseRatingRange(criteria.metacritic);

    this.draftGenres.set([...(criteria.genres ?? [])]);
    this.draftPlatforms.set([...(criteria.platforms ?? [])]);
    this.draftDateFrom.set(years.from);
    this.draftDateTo.set(years.to);
    this.draftRatingMin.set(rating.min);
    this.draftRatingMax.set(rating.max);
    this.draftOrdering.set(criteria.ordering ?? '');
  }

  /** Fetches one page of results; on error, records the page so it can be retried. */
  private fetchPage(criteria: SearchCriteria, page: number) {
    this.loading.set(true);
    this.error.set(null);
    this.failedPage = null;

    return this.gamesService.getGames({ ...criteria, page, page_size: PAGE_SIZE }).pipe(
      tap((response) => this.applyPageResponse(page, response)),
      catchError(() => {
        this.failedPage = page;
        this.error.set('Errore nel caricamento dei risultati. Riprova.');
        this.loading.set(false);
        return EMPTY;
      }),
    );
  }

  /** Appends (or, for page 1, sets) the results and updates the pagination state. */
  private applyPageResponse(page: number, response: GamesResponse): void {
    const previousCount = page === 1 ? 0 : this.games().length;
    const updatedGames =
      page === 1
        ? response.results
        : (() => {
            // Offset-based IGDB pagination may return duplicates across adjacent pages.
            const existingIds = new Set(this.games().map((game) => game.id));
            const uniqueNew = response.results.filter((game) => !existingIds.has(game.id));
            return [...this.games(), ...uniqueNew];
          })();

    // A count equal to the batch size is treated as a batch-only count (no real total);
    // otherwise it is the overall total (e.g. from the local database fallback).
    const isBatchCountOnly = response.count === response.results.length;
    const hasMore = isBatchCountOnly
      ? response.results.length === PAGE_SIZE && (page === 1 || updatedGames.length > previousCount)
      : updatedGames.length < response.count;

    this.games.set(updatedGames);
    this.lastLoadedPage = page;
    this.hasMore.set(hasMore);
    this.countIsExact.set(!isBatchCountOnly || !hasMore);
    this.totalCount.set(isBatchCountOnly ? updatedGames.length : response.count);
    this.loading.set(false);
  }

  /** Opens or closes the filter panel. */
  protected toggleFiltersPanel(): void {
    this.isFiltersOpen.update((open) => !open);
  }

  /** Closes the filter panel when the user clicks outside of it. */
  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.isFiltersOpen()) return;
    const wrapper = this.filtersWrapper()?.nativeElement;
    if (wrapper && !wrapper.contains(event.target as Node)) {
      this.isFiltersOpen.set(false);
    }
  }

  /** Closes the filter panel when Escape is pressed. */
  @HostListener('document:keydown.escape')
  protected onEscapePress(): void {
    if (this.isFiltersOpen()) {
      this.isFiltersOpen.set(false);
    }
  }

  /** Adds or removes a genre from the draft filters. */
  protected onToggleGenre(id: number): void {
    this.toggleDraftGenre(id);
  }

  /** Adds or removes a platform from the draft filters. */
  protected onTogglePlatform(id: number): void {
    this.toggleDraftPlatform(id);
  }

  /** Updates the draft start or end year. */
  protected onUpdateDateRange(event: { type: 'start' | 'end'; value: string }): void {
    if (event.type === 'start') {
      this.draftDateFrom.set(event.value);
    } else {
      this.draftDateTo.set(event.value);
    }
  }

  /** Updates the draft minimum or maximum critic score. */
  protected onUpdateRatingRange(event: { type: 'min' | 'max'; value: string }): void {
    if (event.type === 'min') {
      this.draftRatingMin.set(event.value);
    } else {
      this.draftRatingMax.set(event.value);
    }
  }

  /** Updates the draft ordering. */
  protected onUpdateOrdering(ordering: GameFilters['ordering']): void {
    this.draftOrdering.set(ordering ?? '');
  }

  /** Adds or removes a genre from the draft selection. */
  protected toggleDraftGenre(id: number): void {
    this.draftGenres.update((current) =>
      current.includes(id) ? current.filter((genreId) => genreId !== id) : [...current, id],
    );
  }

  /** Adds or removes a platform from the draft selection. */
  protected toggleDraftPlatform(id: number): void {
    this.draftPlatforms.update((current) =>
      current.includes(id) ? current.filter((platformId) => platformId !== id) : [...current, id],
    );
  }

  /** Clears all draft filters (the applied ones stay until "Apply"). */
  protected resetDraftFilters(): void {
    this.draftGenres.set([]);
    this.draftPlatforms.set([]);
    this.draftDateFrom.set('');
    this.draftDateTo.set('');
    this.draftRatingMin.set('');
    this.draftRatingMax.set('');
    this.draftOrdering.set('');
  }

  /**
   * Applies the draft filters by updating the URL query params instead of
   * calling the service directly, so the filtered search can be shared and reloaded.
   */
  protected applyFilters(): void {
    const nextCriteria: SearchCriteria = {
      search: this.criteria().search,
      genres: this.draftGenres().length ? this.draftGenres() : undefined,
      platforms: this.draftPlatforms().length ? this.draftPlatforms() : undefined,
      dates: buildDatesParam(this.draftDateFrom(), this.draftDateTo()),
      metacritic: buildMetacriticParam(this.draftRatingMin(), this.draftRatingMax()),
      ordering: this.draftOrdering() || undefined,
    };

    const queryParams = buildQueryParams(nextCriteria);
    // Close the inline panel so the updated results are immediately visible.
    this.isFiltersOpen.set(false);
    void this.router.navigate(['/search-results'], { queryParams });
  }

  /** Loads the next page (or retries the failed one). */
  protected onLoadMore(): void {
    if (this.loading() || !this.hasMore()) {
      return;
    }
    this.pageTrigger$.next(this.failedPage ?? this.lastLoadedPage + 1);
  }

  /** Retries the page that failed to load. */
  protected onRetry(): void {
    if (this.loading()) {
      return;
    }
    this.pageTrigger$.next(this.failedPage ?? this.lastLoadedPage + 1);
  }

  /** Adds or removes the game from favorites. */
  protected onFavoriteToggle(game: Game): void {
    this.library.toggle('favorites', game);
  }

  /** Adds or removes the game from the wishlist. */
  protected onWishlistToggle(game: Game): void {
    this.library.toggle('wishlist', game);
  }
}
