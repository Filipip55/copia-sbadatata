import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FiltersDropdown } from './filters-dropdown';

describe('FiltersDropdown', () => {
  let component: FiltersDropdown;
  let fixture: ComponentFixture<FiltersDropdown>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FiltersDropdown],
    }).compileComponents();

    fixture = TestBed.createComponent(FiltersDropdown);
    fixture.componentRef.setInput('filters', { search: '' });
    fixture.componentRef.setInput('genres', []);
    fixture.componentRef.setInput('platforms', []);
    fixture.componentRef.setInput('years', []);
    fixture.componentRef.setInput('dateFrom', '');
    fixture.componentRef.setInput('dateTo', '');
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
