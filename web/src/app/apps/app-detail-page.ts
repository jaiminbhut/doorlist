import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth';
import { problemTitle } from '../core/problem';
import { AppDetail, AppsApi } from './apps-api';

@Component({
  selector: 'app-app-detail-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './app-detail-page.html',
})
export class AppDetailPage implements OnInit {
  private readonly api = inject(AppsApi);
  protected readonly auth = inject(AuthService);

  /** Bound from the :id route parameter. */
  readonly id = input.required<string>();

  protected readonly app = signal<AppDetail | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);

  protected readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/)],
    }),
    apiUrl: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^https?:\/\/\S+$/)],
    }),
    isProduction: new FormControl(false, { nonNullable: true }),
  });

  ngOnInit(): void {
    this.api.get(Number(this.id())).subscribe({
      next: (app) => this.app.set(app),
      error: (error: HttpErrorResponse) =>
        this.loadError.set(
          error.status === 404 ? 'This app does not exist.' : 'Could not load this app.',
        ),
    });
  }

  protected addEnvironment(): void {
    const app = this.app();
    if (!app || this.form.invalid || this.saving()) {
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);
    const { name, apiUrl, isProduction } = this.form.getRawValue();

    this.api
      .addEnvironment(app.id, { name: name.trim(), apiUrl: apiUrl.trim(), isProduction })
      .subscribe({
        next: (environment) => {
          const environments = [...app.environments, environment].sort(
            (a, b) =>
              Number(a.isProduction) - Number(b.isProduction) || a.name.localeCompare(b.name),
          );
          this.app.set({ ...app, environments });
          this.form.reset();
          this.saving.set(false);
        },
        error: (error: unknown) => {
          this.saveError.set(
            problemTitle(error) ?? 'Could not add the environment. Check the name and API URL.',
          );
          this.saving.set(false);
        },
      });
  }
}
