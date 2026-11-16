import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from '../../auth/services/auth.service';
import { Game } from '../../games/models/game';
import { ToastService } from '../../../shared/services/toast';
import { LibraryStore } from './library-store';

const STORAGE_KEY = 'gi.library.v1';

function game(id: number, name = `Game ${id}`): Game {
  return { id, name, slug: `game-${id}`, genres: [], platforms: [], cover_url: '' };
}

function storedGame(id: number) {
  return {
    id,
    slug: `game-${id}`,
    name: `Game ${id}`,
    cover_url: null,
    rating: null,
    aggregated_rating: 80,
    first_release_date: null,
    platforms: [{ id: 6, name: 'PC', slug: 'pc' }],
    genres: [],
  };
}

function setup(loggedIn: boolean) {
  const isAuthenticated = signal(loggedIn);
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AuthService, useValue: { isAuthenticated } },
    ],
  });
  const store = TestBed.inject(LibraryStore);
  const toast = TestBed.inject(ToastService);
  const http = TestBed.inject(HttpTestingController);
  TestBed.tick(); // runs the effect that reads the login state
  return { store, toast, http, isAuthenticated };
}

function respondToListLoad(
  http: HttpTestingController,
  favorites: number[] = [],
  wishlist: number[] = [],
) {
  const toEntries = (ids: number[], listType: string) =>
    ids.map((id) => ({
      list_type: listType,
      added_at: '2026-11-01T10:00:00Z',
      game: storedGame(id),
    }));
  http.expectOne('/api/library/?list_type=favorites').flush(toEntries(favorites, 'favorites'));
  http.expectOne('/api/library/?list_type=wishlist').flush(toEntries(wishlist, 'wishlist'));
}

describe('LibraryStore', () => {
  beforeEach(() => localStorage.clear());

  describe('ospite', () => {
    it('salva i giochi nel localStorage', () => {
      const { store, http } = setup(false);
      store.add('favorites', game(1));
      store.add('wishlist', game(2));

      expect(store.favoriteIds().has(1)).toBe(true);
      expect(store.wishlistIds().has(2)).toBe(true);
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(saved.favorites[0].game.id).toBe(1);
      http.verify(); // no requests to the server
    });

    it('rilegge le liste dal localStorage ignorando i dati non validi', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          favorites: [{ game: game(3), addedAt: 'x' }, { game: null }],
          wishlist: 'boh',
        }),
      );
      const { store } = setup(false);
      expect(
        store
          .games('favorites')()
          .map((g) => g.id),
      ).toEqual([3]);
      expect(store.games('wishlist')()).toEqual([]);
    });

    it('"Annulla" rimette il gioco nella stessa posizione', () => {
      const { store, toast } = setup(false);
      store.add('favorites', game(1));
      store.add('favorites', game(2));
      store.add('favorites', game(3)); // order: 3, 2, 1

      store.removeWithUndo('favorites', game(2));
      expect(
        store
          .games('favorites')()
          .map((g) => g.id),
      ).toEqual([3, 1]);
      expect(toast.current()?.message).toBe('Game 2 rimosso dai preferiti!');

      toast.action(toast.current()!.id);
      expect(
        store
          .games('favorites')()
          .map((g) => g.id),
      ).toEqual([3, 2, 1]);
      expect(toast.current()).toBeNull();
    });

    it('un nuovo avviso sostituisce il precedente, che resta rimosso', () => {
      const { store, toast } = setup(false);
      store.add('wishlist', game(1));
      store.add('wishlist', game(2));

      store.removeWithUndo('wishlist', game(1));
      store.removeWithUndo('wishlist', game(2));

      expect(toast.current()?.message).toBe('Game 2 rimosso dalla wishlist!');
      toast.action(toast.current()!.id);
      expect(
        store
          .games('wishlist')()
          .map((g) => g.id),
      ).toEqual([2]);
    });
  });

  describe('utente registrato', () => {
    afterEach(() => TestBed.inject(HttpTestingController).verify());

    it('carica le liste dal server convertendo le piattaforme in id', () => {
      const { store, http } = setup(true);
      expect(store.status()).toBe('loading');
      respondToListLoad(http, [5], [6]);

      expect(store.status()).toBe('ready');
      expect(store.games('favorites')()[0].platforms).toEqual([6]);
      expect(store.wishlistIds().has(6)).toBe(true);
    });

    it('al login le liste locali non vuote sostituiscono quelle sul server', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          favorites: [
            { game: game(2), addedAt: '' },
            { game: game(1), addedAt: '' },
          ],
          wishlist: [],
        }),
      );
      const { store, http } = setup(true);

      // First Django saves the games in its Game table...
      http.expectOne('/api/games/2/').flush(storedGame(2));
      http.expectOne('/api/games/1/').flush(storedGame(1));
      // ...then only favorites are replaced (the local wishlist is empty).
      const put = http.expectOne({ method: 'PUT', url: '/api/library/' });
      expect(put.request.body).toEqual({ list_type: 'favorites', game_ids: [2, 1] });
      put.flush([]);

      respondToListLoad(http, [2, 1]);
      expect(
        store
          .games('favorites')()
          .map((g) => g.id),
      ).toEqual([2, 1]);
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('se la sincronizzazione fallisce il localStorage resta intatto', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ favorites: [{ game: game(1), addedAt: '' }] }),
      );
      const { store, http } = setup(true);

      http.expectOne('/api/games/1/').flush(null, { status: 503, statusText: 'Down' });

      expect(store.status()).toBe('error');
      expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    });

    it('aggiunge salvando prima il gioco con la richiesta di dettaglio', () => {
      const { store, http } = setup(true);
      respondToListLoad(http);

      store.add('favorites', game(7));
      expect(store.favoriteIds().has(7)).toBe(true); // immediately, without waiting for the server

      http.expectOne('/api/games/7/').flush(storedGame(7));
      const post = http.expectOne({ method: 'POST', url: '/api/library/' });
      expect(post.request.body).toEqual({ game_id: 7, list_type: 'favorites' });
      post.flush({});
    });

    it("se l'aggiunta fallisce il gioco viene tolto e compare un avviso", () => {
      const { store, http, toast } = setup(true);
      respondToListLoad(http);

      store.add('wishlist', game(7));
      http.expectOne('/api/games/7/').flush(null, { status: 503, statusText: 'Down' });

      expect(store.wishlistIds().has(7)).toBe(false);
      expect(toast.current()?.message).toContain('Game 7');
    });

    it("la DELETE parte solo quando l'avviso si chiude", () => {
      const { store, http, toast } = setup(true);
      respondToListLoad(http, [1]);

      store.removeWithUndo('favorites', game(1));
      http.expectNone({ method: 'DELETE' });

      toast.close(toast.current()!.id);
      http.expectOne({ method: 'DELETE', url: '/api/library/1/?list_type=favorites' }).flush(null, {
        status: 204,
        statusText: 'No Content',
      });
      expect(store.favoriteIds().has(1)).toBe(false);
    });

    it('con "Annulla" la DELETE non parte mai', () => {
      const { store, http, toast } = setup(true);
      respondToListLoad(http, [1]);

      store.removeWithUndo('favorites', game(1));
      toast.action(toast.current()!.id);

      http.expectNone({ method: 'DELETE' });
      expect(store.favoriteIds().has(1)).toBe(true);
    });

    it('riaggiungere un gioco appena rimosso equivale ad "Annulla"', () => {
      const { store, http, toast } = setup(true);
      respondToListLoad(http, [1]);

      store.removeWithUndo('favorites', game(1));
      store.add('favorites', game(1));

      expect(toast.current()).toBeNull();
      http.expectNone({ method: 'DELETE' });
      http.expectNone({ method: 'POST' });
      expect(store.favoriteIds().has(1)).toBe(true);
    });
  });
});
