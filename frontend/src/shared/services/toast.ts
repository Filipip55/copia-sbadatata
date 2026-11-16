import { Service, signal } from '@angular/core';

/** Options for `ToastService.show`. */
export interface ToastOptions {
  message: string;
  /** Label of the action button (e.g. "Annulla"). Without it, no button is shown. */
  actionLabel?: string;
  /** Called if the user presses the action button. */
  onAction?: () => void;
  /**
   * Called when the toast closes WITHOUT the action: timeout, close button,
   * or replacement by a newer toast.
   */
  onClose?: () => void;
  /** Duration in milliseconds (default 5000). */
  duration?: number;
}

/** A toast currently on screen. */
export interface ActiveToast extends ToastOptions {
  readonly id: number;
}

const DEFAULT_DURATION = 5000;

/**
 * Shows one toast at a time: a new toast replaces the previous one, which
 * is closed normally (`onClose`).
 * The timer can be paused (mouse hover or keyboard focus), so slower users
 * have time to press "Undo".
 */
@Service()
export class ToastService {
  private readonly active = signal<ActiveToast | null>(null);
  /** The toast currently on screen, or `null`. */
  readonly current = this.active.asReadonly();

  private nextId = 1;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private remaining = 0;
  private startedAt = 0;

  /** Shows a toast and returns its id. */
  show(options: ToastOptions): number {
    this.closeCurrent();
    const toast: ActiveToast = { ...options, id: this.nextId++ };
    this.active.set(toast);
    this.remaining = options.duration ?? DEFAULT_DURATION;
    this.resume();
    return toast.id;
  }

  /** Handles a press of the action button. */
  action(id: number): void {
    const toast = this.active();
    if (toast?.id !== id) return;
    this.reset();
    toast.onAction?.();
  }

  /** Handles a press of the close button. */
  close(id: number): void {
    if (this.active()?.id === id) this.closeCurrent();
  }

  /** Removes the toast without calling `onAction` or `onClose`. */
  dismiss(id: number): void {
    if (this.active()?.id === id) this.reset();
  }

  /** Pauses the auto-close timer, keeping the remaining time. */
  pause(): void {
    if (this.timer === undefined) return;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.remaining -= Date.now() - this.startedAt;
  }

  /** Restarts the auto-close timer with the remaining time. */
  resume(): void {
    if (!this.active() || this.timer !== undefined) return;
    this.startedAt = Date.now();
    this.timer = setTimeout(() => this.closeCurrent(), Math.max(this.remaining, 0));
  }

  /** Closes the current toast and calls its `onClose`. */
  private closeCurrent(): void {
    const toast = this.active();
    if (!toast) return;
    this.reset();
    toast.onClose?.();
  }

  /** Stops the timer and removes the toast without callbacks. */
  private reset(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.active.set(null);
  }
}
