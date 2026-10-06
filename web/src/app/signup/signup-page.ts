import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth';

@Component({
  selector: 'app-signup-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './signup-page.html',
})
export class SignupPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly signingUp = signal(false);
  /** Messages from the API, by field ("email", "password", "displayName"), or "" for the form. */
  protected readonly errors = signal<Record<string, string[]>>({});

  protected readonly form = new FormGroup({
    displayName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/)],
    }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(12)],
    }),
  });

  protected signUp(): void {
    if (this.form.invalid || this.signingUp()) {
      return;
    }

    this.signingUp.set(true);
    this.errors.set({});
    const { displayName, email, password } = this.form.getRawValue();

    this.auth.signUp(email.trim(), password, displayName.trim()).subscribe({
      next: () => void this.router.navigateByUrl('/events'),
      error: (error: HttpErrorResponse) => {
        const fieldErrors =
          error.status === 400
            ? (error.error?.errors as Record<string, string[]> | undefined)
            : undefined;
        this.errors.set(
          fieldErrors ?? {
            '': [
              error.status === 429
                ? 'Too many attempts. Wait a minute and try again.'
                : 'Could not sign up. Try again.',
            ],
          },
        );
        this.signingUp.set(false);
      },
    });
  }
}
