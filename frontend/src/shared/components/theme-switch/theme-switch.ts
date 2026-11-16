import { Component, inject } from '@angular/core';
import { Theme } from '../../services/theme';

/** Toggle between the light and dark theme. */
@Component({
  imports: [],
  selector: 'app-theme-switch',
  styleUrl: './theme-switch.scss',
  templateUrl: './theme-switch.html',
})
export class ThemeSwitch {
  theme = inject(Theme);
  /** The active theme. */
  readonly active = this.theme.themeReadonly;

  /** Switches to the other theme. */
  toggleTheme(): void {
    this.theme.toggleTheme();
  }
}
