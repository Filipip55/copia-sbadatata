import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { GenreSection } from './genre-section';
import { Genre } from '../../../../features/games/models/genre';

describe('GenreSection', () => {
  let component: GenreSection;
  let fixture: ComponentFixture<GenreSection>;
  let el: HTMLElement;

  const mockGenre: Genre = {
    id: 2,
    name: 'Point-and-click',
    slug: 'point-and-click',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GenreSection],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(GenreSection);
    fixture.componentRef.setInput('genre', mockGenre);
    component = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders genre name as a link to filtered search results', () => {
    const link = el.querySelector<HTMLAnchorElement>('h2 a.genre-title-link');
    expect(link).toBeTruthy();
    expect(link?.textContent).toContain('Point-and-click');
    expect(link?.getAttribute('href')).toContain('/search-results?genres=2');
  });
});
