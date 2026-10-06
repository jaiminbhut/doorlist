import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login-page.html',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Bound from the ?returnUrl= query parameter. */
  readonly returnUrl = input<string>();

  protected readonly signingIn = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  protected signIn(): void {
    if (this.form.invalid || this.signingIn()) {
      return;
    }

    this.signingIn.set(true);
    this.error.set(null);
    const { email, password } = this.form.getRawValue();

    this.auth.signIn(email.trim(), password).subscribe({
      next: () =>
        void this.router.navigateByUrl(safeReturnUrl(this.returnUrl()) ?? this.auth.homePath()),
      error: (error: HttpErrorResponse) => {
        this.error.set(
          error.status === 401
            ? 'Email or password is incorrect.'
            : 'Could not sign in. Try again.',
        );
        this.signingIn.set(false);
      },
    });
  }
}

/** Only same-app paths: never an absolute or protocol-relative URL. Null means "go home". */
export function safeReturnUrl(url: string | undefined): string | null {
  return url?.startsWith('/') && !url.startsWith('//') ? url : null;
}
