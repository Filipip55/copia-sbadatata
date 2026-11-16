import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { AuthService } from '../../features/auth/services/auth.service';
import { ApiFieldErrors, RegisterRequest } from '../../features/auth/models/auth.models';
import { Theme } from '../../shared/services/theme';

/** Form-group validator: `password` and `confirmPassword` must match. */
function matchingPasswords(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password')?.value;
  const confirmPassword = control.get('confirmPassword')?.value;
  return password === confirmPassword ? null : { passwordsMismatch: true };
}

/** Sign-up page. On success, redirects to the login page. */
@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register.html',
  styleUrl: './register.scss',
})
export class Register {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  readonly activeTheme = inject(Theme).themeReadonly;
  private readonly router = inject(Router);

  readonly registerForm = this.formBuilder.group(
    {
      username: [
        '',
        [Validators.required, Validators.maxLength(20), Validators.pattern(/^[A-Za-z0-9]+$/)],
      ],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(10)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: matchingPasswords },
  );

  isSubmitting = false;
  successMessage = '';
  generalError = '';

  get username() {
    return this.registerForm.controls.username;
  }

  get email() {
    return this.registerForm.controls.email;
  }

  get password() {
    return this.registerForm.controls.password;
  }

  get confirmPassword() {
    return this.registerForm.controls.confirmPassword;
  }

  /** Validates the form and creates the account. */
  submit(): void {
    this.successMessage = '';
    this.generalError = '';
    this.registerForm.markAllAsTouched();

    if (this.registerForm.invalid || this.isSubmitting) {
      return;
    }

    const { username, email, password } = this.registerForm.getRawValue();
    const request: RegisterRequest = {
      username: username!,
      email: email!,
      password: password!,
    };

    this.isSubmitting = true;
    this.authService.register(request).subscribe({
      next: () => {
        this.isSubmitting = false;
        void this.router.navigate(['/login'], {
          queryParams: { registered: 'true' },
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
      this.generalError = 'Registration failed. Please try again.';
      return;
    }

    for (const [field, messages] of Object.entries(errors)) {
      const control = this.registerForm.get(field);
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
