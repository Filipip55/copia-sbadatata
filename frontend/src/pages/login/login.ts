import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../features/auth/services/auth.service';
import { ApiFieldErrors, LoginRequest } from '../../features/auth/models/auth.models';
import { Theme } from '../../shared/services/theme';

/** Login page. Accepts a username or an email address. */
@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: '../register/register.scss',
})
export class Login {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  readonly activeTheme = inject(Theme).themeReadonly;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly loginForm = this.formBuilder.group({
    username: ['', [Validators.required]],
    password: ['', [Validators.required, Validators.minLength(10)]],
  });

  isSubmitting = false;
  successMessage = '';
  generalError = '';

  /** Shows a confirmation message when coming from a successful sign-up. */
  constructor() {
    if (this.route.snapshot.queryParamMap.get('registered') === 'true') {
      this.successMessage = 'Registration completed. You can now log in.';
    }
  }

  get username() {
    return this.loginForm.controls.username;
  }

  get password() {
    return this.loginForm.controls.password;
  }

  /** Validates the form, logs in, loads the profile and goes to the home page. */
  submit(): void {
    this.generalError = '';
    this.loginForm.markAllAsTouched();

    if (this.loginForm.invalid || this.isSubmitting) {
      return;
    }

    const request: LoginRequest = {
      username: this.username.value!,
      password: this.password.value!,
    };

    this.isSubmitting = true;
    this.authService.login(request).subscribe({
      next: (response) => {
        this.isSubmitting = false;
        this.authService.storeTokens(response);

        this.authService.storeTokens(response);

        this.authService.getProfile().subscribe({
          next: (profile) => {
            this.authService.setCurrentUser(profile);
            this.isSubmitting = false;
            void this.router.navigate(['/']);
          },
          error: () => {
            this.authService.clearTokens();
            this.isSubmitting = false;
            this.generalError = 'Unable to retrieve account information. Please try again.';
          },
        });
      },

      error: (error: HttpErrorResponse) => {
        this.isSubmitting = false;
        this.showApiErrors(error);
      },
    });
  }

  /** Shows backend validation errors on the matching fields, or as a general error. */
  private showApiErrors(error: HttpErrorResponse): void {
    const errors = error.error as ApiFieldErrors | undefined;
    if (!errors || typeof errors !== 'object') {
      this.generalError = 'Login failed. Please try again.';
      return;
    }

    for (const [field, messages] of Object.entries(errors)) {
      const control = this.loginForm.get(field);
      const message = Array.isArray(messages) ? messages[0] : messages;

      if (control && typeof message === 'string') {
        control.setErrors({
          ...(control.errors ?? {}),
          api: message,
        });
      } else if (typeof message === 'string') {
        this.generalError = message;
      }
    }
  }
}
