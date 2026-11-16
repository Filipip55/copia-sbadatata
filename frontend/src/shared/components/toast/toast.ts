import { ChangeDetectionStrategy, Component, effect, inject, untracked } from '@angular/core';
import { ToastService } from '../../services/toast';

/**
 * Shows ToastService's current toast at the bottom of the screen, above the
 * mobile navigation bar. Must be used only once, in app.html.
 */
@Component({
  selector: 'app-toast',
  templateUrl: './toast.html',
  styleUrl: './toast.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Toast {
  protected readonly toasts = inject(ToastService);

  // The timer stays paused while the mouse is over the toast OR focus is inside it.
  private hovered = false;
  private focused = false;

  constructor() {
    effect(() => {
      const toast = this.toasts.current();
      untracked(() => {
        if (toast) {
          // New toast while the mouse is still over it: start paused.
          this.updateTimer();
        } else {
          // The element disappears without mouseleave/focusout: reset by hand,
          // otherwise the next toast would stay paused forever.
          this.resetInteraction();
        }
      });
    });
  }

  /** Tracks mouse hover to pause or resume the timer. */
  protected setHovered(value: boolean): void {
    this.hovered = value;
    this.updateTimer();
  }

  /** Resumes the timer when focus leaves the toast. */
  protected onFocusOut(event: FocusEvent): void {
    const container = event.currentTarget as HTMLElement;
    // Focus moved between the toast's own buttons: it did not leave.
    if (container.contains(event.relatedTarget as Node | null)) return;
    this.focused = false;
    this.updateTimer();
  }

  /** Pauses the timer while focus is inside the toast. */
  protected onFocusIn(): void {
    this.focused = true;
    this.updateTimer();
  }

  /** Runs the toast's action. */
  protected act(id: number): void {
    this.resetInteraction();
    this.toasts.action(id);
  }

  /** Closes the toast. */
  protected close(id: number): void {
    this.resetInteraction();
    this.toasts.close(id);
  }

  /** Pauses the timer while the user interacts with the toast, resumes it otherwise. */
  private updateTimer(): void {
    if (this.hovered || this.focused) {
      this.toasts.pause();
    } else {
      this.toasts.resume();
    }
  }

  /** Forgets the hover and focus state. */
  private resetInteraction(): void {
    this.hovered = false;
    this.focused = false;
  }
}
