import { TestBed } from '@angular/core/testing';
import { RequestScheduler } from './request-scheduler';

describe('RequestSchedulerTs', () => {
  let service: RequestScheduler;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(RequestScheduler);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
