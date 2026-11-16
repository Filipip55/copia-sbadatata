import { Service, signal } from '@angular/core';
import { effect } from '@angular/core';

/** Supported UI color themes. */
type ThemeType = 'light' | 'dark';

/**
 * Current color theme.
 *
 * Applied as Bootstrap's `data-bs-theme` attribute on `<html>` and saved to
 * localStorage. Defaults to the system preference.
 */
@Service()
export class Theme {
  /** Returns the saved theme, or the system preference if none is saved. */
  private getInitialTheme(): ThemeType {
    const savedTheme = localStorage.getItem('theme');

    if (savedTheme === 'dark' || savedTheme === 'light') {
      return savedTheme;
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  private theme = signal<ThemeType>(this.getInitialTheme());
  /** The active theme, read-only. */
  readonly themeReadonly = this.theme.asReadonly();

  constructor() {
    effect(() => {
      document.documentElement.setAttribute('data-bs-theme', this.theme());
      localStorage.setItem('theme', this.theme());
    });
  }

  /** Switches between light and dark. */
  toggleTheme() {
    if (this.theme() === 'light') {
      this.theme.set('dark');
    } else if (this.theme() === 'dark') {
      this.theme.set('light');
    }
  }
}
