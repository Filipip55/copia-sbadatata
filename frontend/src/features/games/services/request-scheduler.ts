import { Service } from '@angular/core';

/**
 * Spaces out requests to the games API so that sections loading in
 * parallel do not hit the backend's (and IGDB's) rate limit.
 */
@Service()
export class RequestScheduler {
  private queue: Promise<void> = Promise.resolve();
  private nextRequestAt = 0;

  /** Minimum delay between two consecutive requests. */
  private readonly intervalMs = 600;

  /**
   * Waits until it is the caller's turn to send a request.
   *
   * Calls are served in FIFO order, at least `intervalMs` apart.
   *
   * @returns A promise that resolves when the request can be sent.
   */
  waitTurn(): Promise<void> {
    const turn = this.queue.then(async () => {
      const delay = Math.max(0, this.nextRequestAt - Date.now());

      if (delay > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }

      this.nextRequestAt = Date.now() + this.intervalMs;
    });

    this.queue = turn.catch(() => undefined);

    return turn;
  }
}
