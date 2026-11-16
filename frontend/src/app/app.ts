import { Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { Header } from '../shared/components/header/header';
import { BottomNavigation } from '../shared/components/bottom-navigation/bottom-navigation';
import { Toast } from '../shared/components/toast/toast';
import { Footer } from '../shared/components/footer/footer';

/** Root component: header, page outlet, navigation, toasts and footer. */
@Component({
  imports: [RouterOutlet, Header, BottomNavigation, Toast, Footer],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('gaming-explorer');
  private readonly router = inject(Router);

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /** Whether to show the navigation bars (hidden on the login, register and profile pages). */
  readonly showNav = computed(() => {
    const url = this.currentUrl();
    const cleanUrl = url.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
    return cleanUrl !== '/login' && cleanUrl !== '/register' && cleanUrl !== '/profile';
  });
}
