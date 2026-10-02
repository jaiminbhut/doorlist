import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth';
import { APP_NAME_MAX_LENGTH, AppSummary, AppsApi } from './apps-api';

@Component({
  selector: 'app-apps-page',
  imports: [ReactiveFormsModule, DatePipe, RouterLink],
  templateUrl: './apps-page.html',
})
export class AppsPage implements OnInit {
  private readonly api = inject(AppsApi);
  protected readonly auth = inject(AuthService);

  protected readonly maxLength = APP_NAME_MAX_LENGTH;
  protected readonly apps = signal<AppSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);

  protected readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.maxLength(APP_NAME_MAX_LENGTH),
        Validators.pattern(/\S/),
      ],
    }),
  });

  ngOnInit(): void {
    this.api.list().subscribe({
      next: (apps) => {
        this.apps.set(apps);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set('Could not load apps. Is the API running?');
        this.loading.set(false);
      },
    });
  }

  protected add(): void {
    if (this.form.invalid || this.saving()) {
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);

    this.api.create(this.form.controls.name.value.trim()).subscribe({
      next: (app) => {
        this.apps.update((apps) => [...apps, app].sort((a, b) => a.name.localeCompare(b.name)));
        this.form.reset();
        this.saving.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.saveError.set(messageFor(error));
        this.saving.set(false);
      },
    });
  }
}

function messageFor(error: HttpErrorResponse): string {
  switch (error.status) {
    case 409:
      return 'An app with that name already exists.';
    case 400:
      return `Give the app a name of up to ${APP_NAME_MAX_LENGTH} characters.`;
    default:
      return 'Could not save the app. Try again.';
  }
}
