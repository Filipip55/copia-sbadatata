import { Component, output, inject } from '@angular/core';
import { ThemeSwitch } from '../theme-switch/theme-switch';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../features/auth/services/auth.service';
import { finalize } from 'rxjs';

/** Account menu opened from the header: theme switch, profile link and logout. */
@Component({
  imports: [ThemeSwitch, RouterLink],
  selector: 'app-account-dropdown',
  styleUrl: './account-dropdown.scss',
  templateUrl: './account-dropdown.html',
})
export class AccountDropdown {
  authService = inject(AuthService);
  router = inject(Router);
  /** Emitted when the menu should close. */
  close = output<void>();

  /**
   * Closes the menu, logs out and returns to the home page.
   *
   * Local tokens are cleared even if the logout request fails.
   */
  accountLogout(): void {
    this.close.emit();
    this.authService
      .logout()
      .pipe(
        finalize(() => {
          this.authService.clearTokens();
          this.router.navigateByUrl('/');
        }),
      )
      .subscribe();
  }
}
