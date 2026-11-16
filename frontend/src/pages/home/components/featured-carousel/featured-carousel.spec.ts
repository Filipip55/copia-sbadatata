import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FeaturedCarousel } from './featured-carousel';

describe('FeaturedCarousel', () => {
  let component: FeaturedCarousel;
  let fixture: ComponentFixture<FeaturedCarousel>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FeaturedCarousel],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(FeaturedCarousel);
    fixture.componentRef.setInput('games', []);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
