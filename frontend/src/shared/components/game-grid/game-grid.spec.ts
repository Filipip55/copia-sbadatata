import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GameGrid } from './game-grid';
import { Game } from '../../../features/games/models/game';

const game = (id: number, platforms: number[] = []): Game => ({
  id,
  name: `Gioco ${id}`,
  slug: `gioco-${id}`,
  genres: [],
  platforms,
  cover_url: '',
});

function setup(inputs: Record<string, unknown>) {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(GameGrid);
  for (const [key, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(key, value);
  }
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('GameGrid', () => {
  it('mostra una card per ogni gioco', () => {
    const { el } = setup({ games: [game(1), game(2), game(3)] });
    expect(el.querySelectorAll('app-game-card').length).toBe(3);
  });

  it('mostra gli scheletri durante il primo caricamento', () => {
    const { el } = setup({ loading: true, skeletonCount: 4 });
    expect(el.querySelectorAll('.placeholder-glow').length).toBe(4);
    expect(el.querySelector('app-game-card')).toBeNull();
  });

  it('mostra il messaggio di vuoto', () => {
    const { el } = setup({ games: [], emptyMessage: 'Nessun preferito' });
    expect(el.textContent).toContain('Nessun preferito');
  });

  it("mostra l'errore ed emette retry", () => {
    const { fixture, el } = setup({ error: 'Server non raggiungibile' });
    let retried = false;
    fixture.componentInstance.retry.subscribe(() => (retried = true));
    expect(el.textContent).toContain('Server non raggiungibile');
    el.querySelector<HTMLButtonElement>('.alert button')!.click();
    expect(retried).toBe(true);
  });

  it('traduce gli id delle piattaforme e ignora quelli sconosciuti', () => {
    const { el } = setup({ games: [game(1, [130, 999])], platformNames: { 130: 'Switch' } });
    expect(el.textContent).toContain('Switch');
    expect(el.textContent).not.toContain('999');
  });

  it('mostra "Carica altri" solo se hasMore è true', () => {
    const { el } = setup({ games: [game(1)], hasMore: true });
    expect(el.textContent).toContain('Carica altri giochi');
  });
});
