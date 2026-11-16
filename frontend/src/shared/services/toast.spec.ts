import { TestBed } from '@angular/core/testing';
import { ToastService } from './toast';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    service = TestBed.inject(ToastService);
  });

  it('chiama onAction e non onClose quando si preme il pulsante', () => {
    const calls: string[] = [];
    const id = service.show({
      message: 'Rimosso',
      actionLabel: 'Annulla',
      onAction: () => calls.push('action'),
      onClose: () => calls.push('close'),
    });
    service.action(id);
    expect(calls).toEqual(['action']);
    expect(service.current()).toBeNull();
  });

  it('un nuovo avviso chiude il precedente con onClose', () => {
    const calls: string[] = [];
    service.show({ message: 'Primo', onClose: () => calls.push('primo') });
    service.show({ message: 'Secondo' });
    expect(calls).toEqual(['primo']);
    expect(service.current()?.message).toBe('Secondo');
  });

  it('si chiude da solo allo scadere del tempo', async () => {
    let closed = false;
    service.show({ message: 'Ciao', duration: 10, onClose: () => (closed = true) });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(closed).toBe(true);
  });

  it('in pausa non si chiude', async () => {
    let closed = false;
    service.show({ message: 'Ciao', duration: 10, onClose: () => (closed = true) });
    service.pause();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(closed).toBe(false);
    service.resume();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(closed).toBe(true);
  });

  it("dismiss toglie l'avviso senza callback", () => {
    let called = false;
    const id = service.show({
      message: 'Ciao',
      onClose: () => (called = true),
      onAction: () => (called = true),
    });
    service.dismiss(id);
    expect(called).toBe(false);
    expect(service.current()).toBeNull();
  });
});
