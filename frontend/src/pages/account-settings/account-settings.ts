import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Observable } from 'rxjs';
import { AuthService } from '../../features/auth/services/auth.service';
import { ApiFieldErrors, UserProfile } from '../../features/auth/models/auth.models';

/** Form-group validator: `newPassword` and `confirmPassword` must match. */
function matchingPasswords(control: AbstractControl): ValidationErrors | null {
  const password = control.get('newPassword')?.value;
  const confirmation = control.get('confirmPassword')?.value;
  return password === confirmation ? null : { passwordsMismatch: true };
}

/** Account settings page (`/profile`): avatar, username, password, logout and account deletion. */
@Component({
  selector: 'app-account-settings',
  imports: [DatePipe, ReactiveFormsModule, RouterLink],
  templateUrl: './account-settings.html',
  styleUrl: './account-settings.scss',
})
export class AccountSettings {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly changeDetector = inject(ChangeDetectorRef);

  readonly usernameForm = this.formBuilder.group({
    username: [
      '',
      [Validators.required, Validators.maxLength(20), Validators.pattern(/^[A-Za-z0-9]+$/)],
    ],
  });
  readonly passwordForm = this.formBuilder.group(
    {
      oldPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(10)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: matchingPasswords },
  );
  readonly deleteForm = this.formBuilder.group({
    password: ['', Validators.required],
  });

  profile: UserProfile | null = null;
  selectedAvatar: number | null = null;
  readonly avatarOptions = [0, 1, 2, 3, 4, 5];
  /** Accessible (Italian) names of the avatars. */
  readonly avatarLabels: Record<number, string> = {
    0: 'Boccale',
    1: 'Gamepad',
    2: 'Elmo',
    3: 'Dado D20',
    4: 'Cappello da mago',
    5: 'Ciotola',
  };
  isLoading = true;
  isSubmitting = false;
  message = '';
  error = '';

  /** Loads the profile and pre-fills the username form. */
  constructor() {
    this.authService.getProfile().subscribe({
      next: (profile) => {
        this.profile = profile;
        this.selectedAvatar = profile.avatar ?? null;
        this.usernameForm.patchValue({ username: profile.username });
        this.isLoading = false;
        this.changeDetector.markForCheck();
      },
      error: () => {
        this.isLoading = false;
        this.error = 'Unable to load your account. Please try again.';
        this.changeDetector.markForCheck();
      },
    });
  }

  /** Selects an avatar without saving it. */
  selectAvatar(idx: number | null): void {
    this.selectedAvatar = idx;
  }

  /** Saves the selected avatar. */
  saveAvatar(): void {
    this.message = '';
    this.error = '';
    if (this.isSubmitting) return;
    this.isSubmitting = true;
    this.authService.updateAvatar(this.selectedAvatar).subscribe({
      next: (profile) => {
        this.isSubmitting = false;
        this.profile = profile;
        this.selectedAvatar = profile.avatar ?? null;
        this.authService.setCurrentUser(profile);
        this.message = 'Avatar updated successfully.';
        this.changeDetector.markForCheck();
      },
      error: (error: HttpErrorResponse) => {
        this.isSubmitting = false;
        this.showError(error);
        this.changeDetector.markForCheck();
      },
    });
  }

  /** Submits the new username. */
  changeUsername(): void {
    this.submitForm(this.usernameForm, () =>
      this.authService.changeUsername({ username: this.usernameForm.controls.username.value! }),
    );
  }

  /** Submits the password change. */
  changePassword(): void {
    this.submitForm(
      this.passwordForm,
      () => {
        const values = this.passwordForm.getRawValue();
        return this.authService.changePassword({
          old_password: values.oldPassword!,
          new_password: values.newPassword!,
          confirm_password: values.confirmPassword!,
        });
      },
      'Password updated successfully.',
    );
  }

  /** Logs out and goes to the login page, even if the request fails. */
  logout(): void {
    this.isSubmitting = true;
    this.authService.logout().subscribe({
      next: () => this.finishLogout(),
      error: () => this.finishLogout(),
    });
  }

  /** Asks for confirmation, then permanently deletes the account. */
  deleteAccount(): void {
    this.deleteForm.markAllAsTouched();
    if (
      this.deleteForm.invalid ||
      !window.confirm(
        'Delete your account permanently? This removes your profile and personal library data and cannot be undone.',
      )
    ) {
      return;
    }
    this.isSubmitting = true;
    this.authService.deleteAccount(this.deleteForm.controls.password.value!).subscribe({
      next: () => this.finishLogout(),
      error: (error: HttpErrorResponse) => {
        this.isSubmitting = false;
        this.showError(error);
      },
    });
  }

  /**
   * Validates a form, sends its request and shows the outcome.
   *
   * @param form - The form to validate and reset on success.
   * @param request - Factory for the API call.
   * @param success - Success message (defaults to the username one).
   */
  private submitForm(
    form: typeof this.usernameForm | typeof this.passwordForm,
    request: () => Observable<UserProfile | { detail: string }>,
    success = '',
  ): void {
    this.message = '';
    this.error = '';
    form.markAllAsTouched();
    if (form.invalid || this.isSubmitting) return;
    this.isSubmitting = true;
    request().subscribe({
      next: (profile) => {
        this.isSubmitting = false;
        this.message = success || 'Username updated successfully.';
        if ('username' in profile) {
          this.profile = profile;
          this.usernameForm.patchValue({ username: profile.username });
          this.authService.setCurrentUser(profile);
        }
        form.reset();
        if (form === this.usernameForm)
          this.usernameForm.patchValue({ username: this.profile?.username ?? '' });
      },
      error: (error: HttpErrorResponse) => {
        this.isSubmitting = false;
        this.showError(error);
      },
    });
  }

  /** Shows the first backend error, or a generic message. */
  private showError(error: HttpErrorResponse): void {
    const errors = error.error as ApiFieldErrors | undefined;
    const firstError = errors && typeof errors === 'object' ? Object.values(errors)[0] : undefined;
    this.error = Array.isArray(firstError)
      ? firstError[0]
      : firstError || 'The operation failed. Please try again.';
  }

  /** Clears the session and goes to the login page. */
  private finishLogout(): void {
    this.authService.clearTokens();
    void this.router.navigate(['/login']);
  }
}
