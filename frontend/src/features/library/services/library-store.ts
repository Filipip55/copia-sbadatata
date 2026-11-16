import { Service, Signal, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import {
  Observable,
  Subject,
  catchError,
  concatMap,
  forkJoin,
  from,
  map,
  mergeMap,
  of,
  switchMap,
  throwError,
  toArray,
} from 'rxjs';
import { AuthService } from '../../auth/services/auth.service';
import { Games } from '../../games/services/games';
import { Game } from '../../games/models/game';
import { ToastService } from '../../../shared/services/toast';
import {
  LIST_TYPES,
  LibraryEntry,
  LibraryEntryResponse,
  LibraryLists,
  ListType,
  emptyLists,
  toGame,
} from '../models/library';

const API_URL = '/api/library/';
const STORAGE_KEY = 'gi.library.v1';
/** How many detail requests to run in parallel while syncing a list. */
const SYNC_CONCURRENCY = 4;

/** Loading state of the lists. */
export type LibraryStatus = 'loading' | 'ready' | 'error';

/** An undoable removal, still waiting to be confirmed. */
interface PendingRemoval {
  readonly listType: ListType;
  readonly entry: LibraryEntry;
  /** Position of the entry in the list, used to restore it on undo. */
  readonly index: number;
  /** Value of `LibraryStore.generation` when the removal started. */
  readonly generation: number;
  toastId?: number;
}

/** Italian fragments used in toast messages. */
const LIST_LABELS: Record<ListType, { from: string }> = {
  favorites: { from: 'dai preferiti' },
  wishlist: { from: 'dalla wishlist' },
};

/**
 * Shared state of the favorites and wishlist lists.
 *
 * - Guest: the lists live in the browser's localStorage.
 * - Logged-in user: the lists live on the server. At login, every NON-empty
 *   local list replaces the one on the server; then localStorage is cleared.
 *
 * Changes are optimistic: the UI updates immediately and the change is
 * rolled back if the server responds with an error.
 * All writes to the server go through a queue and run one at a time, so a
 * DELETE can never overtake the POST for the same game.
 */
@Service()
export class LibraryStore {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly gamesService = inject(Games);
  private readonly toast = inject(ToastService);

  private readonly lists = signal<LibraryLists>(emptyLists());
  private readonly statusState = signal<LibraryStatus>('loading');
  private readonly errorState = signal<string | null>(null);

  readonly status = this.statusState.asReadonly();
  readonly error = this.errorState.asReadonly();

  /** Games of each list, from most to least recent. */
  private readonly gamesByList: Record<ListType, Signal<Game[]>> = {
    favorites: computed(() => this.lists().favorites.map((entry) => entry.game)),
    wishlist: computed(() => this.lists().wishlist.map((entry) => entry.game)),
  };

  /** Ids of the favorite games, for quick lookups. */
  readonly favoriteIds = computed(
    () => new Set(this.lists().favorites.map((entry) => entry.game.id)) as ReadonlySet<number>,
  );
  /** Ids of the wishlisted games, for quick lookups. */
  readonly wishlistIds = computed(
    () => new Set(this.lists().wishlist.map((entry) => entry.game.id)) as ReadonlySet<number>,
  );

  /** Queue of writes to the server, run one at a time. */
  private readonly writes$ = new Subject<Observable<unknown>>();

  /** Changes at every login/logout: responses arriving after the change are ignored. */
  private generation = 0;
  private pending: PendingRemoval | null = null;

  constructor() {
    this.writes$.pipe(concatMap((write) => write)).subscribe();

    effect(() => {
      const loggedIn = this.auth.isAuthenticated();
      untracked(() => this.start(loggedIn));
    });
  }

  /** Returns the games of a list, from most to least recent. */
  games(listType: ListType): Signal<Game[]> {
    return this.gamesByList[listType];
  }

  /** Whether the game is in the given list. */
  has(listType: ListType, gameId: number): boolean {
    return this.lists()[listType].some((entry) => entry.game.id === gameId);
  }

  /** Adds or removes the game, without a toast. For buttons outside the list's own page. */
  toggle(listType: ListType, game: Game): void {
    if (this.has(listType, game.id)) {
      this.remove(listType, game);
    } else {
      this.add(listType, game);
    }
  }

  /**
   * Adds a game at the top of a list (optimistically).
   *
   * If the same game was just removed and its DELETE has not been sent yet,
   * this behaves like pressing "Undo".
   */
  add(listType: ListType, game: Game): void {
    if (this.has(listType, game.id)) return;

    // The game was just removed and the DELETE has not been sent yet:
    // same as pressing "Undo".
    const pending = this.pending;
    if (pending?.listType === listType && pending.entry.game.id === game.id) {
      if (pending.toastId !== undefined) this.toast.dismiss(pending.toastId);
      this.undo(pending);
      return;
    }

    const entry: LibraryEntry = { game, addedAt: new Date().toISOString() };
    this.updateList(listType, (entries) => [entry, ...entries]);

    if (!this.auth.isAuthenticated()) return;

    // Request the details first, so Django saves the game in its Game
    // table (the POST requires it). Then add it to the list.
    const generation = this.generation;
    this.enqueue(
      this.gamesService
        .getGameDetail(game.id)
        .pipe(switchMap(() => this.http.post(API_URL, { game_id: game.id, list_type: listType }))),
      () => {
        if (generation !== this.generation) return;
        this.updateList(listType, (entries) => entries.filter((e) => e !== entry));
        this.toast.show({ message: `Non è stato possibile aggiungere ${game.name}. Riprova.` });
      },
    );
  }

  /** Removes the game immediately, without a toast. */
  remove(listType: ListType, game: Game): void {
    const index = this.indexOf(listType, game.id);
    if (index === -1) return;
    const entry = this.lists()[listType][index];
    this.updateList(listType, (entries) => entries.filter((e) => e !== entry));
    this.deleteOnServer({ listType, entry, index, generation: this.generation });
  }

  /**
   * Removes the game from the UI and shows a toast with an "Undo" button.
   * For a logged-in user, the DELETE is sent only when the toast closes
   * without "Undo". A new toast closes the previous one, confirming it.
   */
  removeWithUndo(listType: ListType, game: Game): void {
    const index = this.indexOf(listType, game.id);
    if (index === -1) return;
    const entry = this.lists()[listType][index];
    this.updateList(listType, (entries) => entries.filter((e) => e !== entry));

    const pending: PendingRemoval = { listType, entry, index, generation: this.generation };
    this.pending = pending;
    pending.toastId = this.toast.show({
      message: `${game.name} rimosso ${LIST_LABELS[listType].from}!`,
      actionLabel: 'Annulla',
      onAction: () => this.undo(pending),
      onClose: () => this.commit(pending),
    });
  }

  /** Reloads the lists (the "Retry" button). */
  reload(): void {
    this.start(this.auth.isAuthenticated());
  }

  // ---------------------------------------------------------------------------
  // Startup, login and logout
  // ---------------------------------------------------------------------------
  /**
   * Resets the state for a new session: guest lists from localStorage,
   * or server lists for a logged-in user.
   */
  private start(loggedIn: boolean): void {
    this.generation++;
    this.pending = null;
    this.errorState.set(null);

    if (!loggedIn) {
      this.lists.set(readLocal());
      this.statusState.set('ready');
      return;
    }

    // Logged-in user: the server lists win, the local ones are discarded.
    this.lists.set(emptyLists());
    this.statusState.set('loading');
    clearLocal();
    this.loadFromServer(this.generation);
  }

  /** Loads both lists from the server, ignoring the result if the session changed meanwhile. */
  private loadFromServer(generation: number): void {
    forkJoin({
      favorites: this.fetchList('favorites'),
      wishlist: this.fetchList('wishlist'),
    }).subscribe({
      next: (lists) => {
        if (generation !== this.generation) return;
        this.lists.set(lists);
        this.statusState.set('ready');
      },
      error: () => {
        if (generation !== this.generation) return;
        this.statusState.set('error');
        this.errorState.set('Non è stato possibile caricare le tue liste.');
      },
    });
  }

  /** Fetches a single list from the server. */
  private fetchList(listType: ListType): Observable<LibraryEntry[]> {
    const params = new HttpParams().set('list_type', listType);
    return this.http
      .get<LibraryEntryResponse[]>(API_URL, { params })
      .pipe(map((entries) => entries.map(fromResponse)));
  }

  /**
   * Replaces a list on the server. First makes Django save every game in its
   * Game table (through the detail request); games IGDB no longer knows (404)
   * are dropped, any other error aborts the whole operation.
   */
  private replaceOnServer(listType: ListType, gameIds: number[]): Observable<unknown> {
    return from(gameIds).pipe(
      mergeMap(
        (id) =>
          this.gamesService.getGameDetail(id).pipe(
            map(() => id),
            catchError((error: HttpErrorResponse) =>
              error.status === 404 ? of(null) : throwError(() => error),
            ),
          ),
        SYNC_CONCURRENCY,
      ),
      toArray(),
      // mergeMap does not keep the order: rebuild it from the original list.
      map((saved) => gameIds.filter((id) => saved.includes(id))),
      concatMap((ids) => this.http.put(API_URL, { list_type: listType, game_ids: ids })),
    );
  }

  // ---------------------------------------------------------------------------
  // Undo / confirm
  // ---------------------------------------------------------------------------

  /** Puts the removed entry back ("Undo" pressed). */
  private undo(pending: PendingRemoval): void {
    if (this.pending === pending) this.pending = null;
    if (pending.generation !== this.generation) return;
    this.restore(pending);
  }

  /** Confirms a removal once its toast closes without "Undo". */
  private commit(pending: PendingRemoval): void {
    if (this.pending === pending) this.pending = null;
    this.deleteOnServer(pending);
  }

  /** Sends the DELETE for a removal; on failure restores the entry and shows a toast. */
  private deleteOnServer(removal: PendingRemoval): void {
    // Guest: localStorage is already up to date. After a login/logout
    // the removal no longer concerns the lists on screen.
    if (removal.generation !== this.generation || !this.auth.isAuthenticated()) return;

    const { listType, entry } = removal;
    const params = new HttpParams().set('list_type', listType);
    this.enqueue(
      this.http.delete(`${API_URL}${entry.game.id}/`, { params }).pipe(
        // 404: the game was already gone, so the removal succeeded.
        catchError((error: HttpErrorResponse) =>
          error.status === 404 ? of(null) : throwError(() => error),
        ),
      ),
      () => {
        if (removal.generation !== this.generation) return;
        this.restore(removal);
        this.toast.show({
          message: `Non è stato possibile rimuovere ${entry.game.name}. Riprova.`,
        });
      },
    );
  }

  /** Puts an entry back where it was. */
  private restore({ listType, entry, index }: PendingRemoval): void {
    if (this.has(listType, entry.game.id)) return;
    this.updateList(listType, (entries) => {
      const copy = [...entries];
      copy.splice(Math.min(index, copy.length), 0, entry);
      return copy;
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Adds a write to the server queue; `onError` runs if it fails. */
  private enqueue(request: Observable<unknown>, onError: () => void): void {
    this.writes$.next(
      request.pipe(
        catchError(() => {
          onError();
          return of(null);
        }),
      ),
    );
  }

  /** Position of the game in the list, or -1 if absent. */
  private indexOf(listType: ListType, gameId: number): number {
    return this.lists()[listType].findIndex((entry) => entry.game.id === gameId);
  }

  /** Updates one list and, for guests, persists the lists to localStorage. */
  private updateList(
    listType: ListType,
    update: (entries: readonly LibraryEntry[]) => readonly LibraryEntry[],
  ): void {
    this.lists.update((lists) => ({ ...lists, [listType]: update(lists[listType]) }));
    if (!this.auth.isAuthenticated()) writeLocal(this.lists());
  }
}

/** Converts a backend list entry to a `LibraryEntry`. */
function fromResponse(entry: LibraryEntryResponse): LibraryEntry {
  return { game: toGame(entry.game), addedAt: entry.added_at };
}

// -----------------------------------------------------------------------------
// localStorage (guests only)
// -----------------------------------------------------------------------------

/** Reads the guest lists from localStorage. */
function readLocal(): LibraryLists {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyLists();
    const parsed = JSON.parse(raw) as Partial<Record<ListType, unknown>>;
    return {
      favorites: sanitize(parsed?.favorites),
      wishlist: sanitize(parsed?.wishlist),
    };
  } catch {
    // Corrupted data or localStorage unavailable: start from scratch.
    return emptyLists();
  }
}

/** Anyone can edit localStorage: keep only well-formed entries. */
function sanitize(value: unknown): LibraryEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is LibraryEntry =>
        typeof entry?.game?.id === 'number' && typeof entry.game.name === 'string',
    )
    .map((entry) => ({
      game: {
        ...entry.game,
        platforms: Array.isArray(entry.game.platforms) ? entry.game.platforms : [],
        genres: Array.isArray(entry.game.genres) ? entry.game.genres : [],
        cover_url: typeof entry.game.cover_url === 'string' ? entry.game.cover_url : '',
      },
      addedAt: typeof entry.addedAt === 'string' ? entry.addedAt : new Date().toISOString(),
    }));
}

/** Saves the guest lists to localStorage. */
function writeLocal(lists: LibraryLists): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
  } catch {
    // Quota exceeded or private browsing: the lists stay in memory only.
  }
}

/** Removes the guest lists from localStorage. */
function clearLocal(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do.
  }
}
