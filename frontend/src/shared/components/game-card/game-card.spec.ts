import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GameCard } from './game-card';
import { Game } from '../../../features/games/models/game';

const zelda: Game = {
  id: 7346,
  name: 'The Legend of Zelda: Breath of the Wild',
  slug: 'the-legend-of-zelda-breath-of-the-wild',
  rating: 92.49,
  aggregated_rating: 97.59,
  first_release_date: 1488499200,
  genres: [9, 31],
  platforms: [41, 130],
  cover_url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co3p2d.jpg',
};

function setup(game: Game, platformLabels: string[] = []) {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(GameCard);
  fixture.componentRef.setInput('game', game);
  fixture.componentRef.setInput('platformLabels', platformLabels);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('GameCard', () => {
  it('mostra titolo, data e voti arrotondati', () => {
    const { el } = setup(zelda);
    expect(el.textContent).toContain('Breath of the Wild');
    expect(el.textContent).toContain('03/03/2017');
    expect(el.querySelector('.critic-badge')?.textContent?.trim()).toBe('98');
    expect(el.textContent).toContain('92');
  });

  it('mostra il segnaposto se manca la copertina', () => {
    const { el } = setup({ ...zelda, cover_url: '' });
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('.cover-fallback')).not.toBeNull();
  });

  it('gestisce un gioco senza voti né data', () => {
    const { el } = setup({
      ...zelda,
      rating: undefined,
      aggregated_rating: undefined,
      first_release_date: undefined,
    });
    expect(el.querySelector('.critic-badge')).toBeNull();
    expect(el.textContent).toContain('Nessun voto degli utenti');
    expect(el.textContent).toContain('Data di uscita non disponibile');
  });

  it('raggruppa le piattaforme oltre il limite', () => {
    const { el } = setup(zelda, ['PC', 'Switch', 'Wii U', 'PS5']);
    expect(el.textContent).toContain('+1');
  });

  it('emette favoriteToggle al click sul cuore', () => {
    const { fixture, el } = setup(zelda);
    let emitted: Game | undefined;
    fixture.componentInstance.favoriteToggle.subscribe((g) => (emitted = g));
    el.querySelector<HTMLButtonElement>('.favorite-btn')!.click();
    expect(emitted?.id).toBe(7346);
  });

  it('emette wishlistToggle al click sul segnalibro', () => {
    const { fixture, el } = setup(zelda);
    let emitted: Game | undefined;
    fixture.componentInstance.wishlistToggle.subscribe((g) => (emitted = g));
    el.querySelector<HTMLButtonElement>('.wishlist-btn')!.click();
    expect(emitted?.id).toBe(7346);
  });

  it('segnala lo stato dei due pulsanti con aria-pressed', () => {
    const { fixture, el } = setup(zelda);
    fixture.componentRef.setInput('isWishlisted', true);
    fixture.detectChanges();
    expect(el.querySelector('.favorite-btn')!.getAttribute('aria-pressed')).toBe('false');
    expect(el.querySelector('.wishlist-btn')!.getAttribute('aria-pressed')).toBe('true');
  });
});
