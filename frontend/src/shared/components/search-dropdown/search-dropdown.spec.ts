import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SearchDropdown } from './search-dropdown';
import { Game } from '../../../features/games/models/game';

@Component({ template: '' })
class DummyRoute {}

const sampleGame: Game = {
  id: 1,
  name: 'Zelda',
  slug: 'zelda',
  genres: [],
  platforms: [],
  cover_url: '',
};

describe('SearchDropdown', () => {
  let component: SearchDropdown;
  let fixture: ComponentFixture<SearchDropdown>;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SearchDropdown],
      providers: [provideRouter([{ path: 'search-results', component: DummyRoute }])],
    }).compileComponents();

    fixture = TestBed.createComponent(SearchDropdown);
    component = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('results', []);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('mostra il link "Vedi tutti i risultati" solo quando ci sono risultati ed emette viewAll al click', async () => {
    expect(el.querySelector('a')).toBeNull();

    fixture.componentRef.setInput('results', [sampleGame]);
    fixture.componentRef.setInput('queryParams', { q: 'zelda', genres: '12' });
    fixture.detectChanges();

    const link = el.querySelector<HTMLAnchorElement>('a');
    expect(link).toBeTruthy();
    expect(link!.textContent).toContain('Vedi tutti i risultati');
    expect(link!.getAttribute('href')).toContain('/search-results');
    expect(link!.getAttribute('href')).toContain('q=zelda');

    let emitted = false;
    component.viewAll.subscribe(() => (emitted = true));
    link!.click();
    await fixture.whenStable();
    expect(emitted).toBe(true);
  });
});
