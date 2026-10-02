import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AppEnvironment, AppSummary, AppsApi } from '../apps/apps-api';
import { AuthService } from '../core/auth';
import { problemTitle } from '../core/problem';
import { PLATFORM_LABELS, Platform, ReleaseSummary, ReleasesApi } from './releases-api';

@Component({
  selector: 'app-release-board-page',
  imports: [ReactiveFormsModule, RouterLink, DatePipe],
  templateUrl: './release-board-page.html',
})
export class ReleaseBoardPage implements OnInit {
  private readonly releasesApi = inject(ReleasesApi);
  private readonly appsApi = inject(AppsApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly auth = inject(AuthService);

  /** Bound from the ?appId= query parameter: show one app's releases. */
  readonly appId = input<string>();

  protected readonly platformLabels = PLATFORM_LABELS;
  protected readonly platforms = Object.keys(PLATFORM_LABELS) as Platform[];

  protected readonly releases = signal<ReleaseSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly inProgress = computed(() =>
    this.releases().filter((r) => r.status === 'inProgress'),
  );
  protected readonly shipped = computed(() =>
    this.releases().filter((r) => r.status === 'shipped'),
  );

  protected readonly apps = signal<AppSummary[]>([]);
  protected readonly environments = signal<AppEnvironment[]>([]);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);

  protected readonly form = new FormGroup({
    appId: new FormControl<number | null>(null, { validators: [Validators.required] }),
    environmentId: new FormControl<number | null>(null, { validators: [Validators.required] }),
    platform: new FormControl<Platform>('android', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    versionName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/)],
    }),
    buildNumber: new FormControl<number | null>(null, {
      validators: [Validators.min(0), Validators.pattern(/^\d+$/)],
    }),
    notes: new FormControl('', { nonNullable: true }),
  });

  ngOnInit(): void {
    const appId = this.appId() ? Number(this.appId()) : undefined;

    this.releasesApi.list(appId).subscribe({
      next: (releases) => {
        this.releases.set(releases);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set('Could not load releases.');
        this.loading.set(false);
      },
    });

    if (this.auth.canWorkOnReleases()) {
      this.appsApi.list().subscribe((apps) => this.apps.set(apps));
      this.form.controls.appId.valueChanges
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((selected) => this.loadEnvironments(selected));
      if (appId) {
        this.form.controls.appId.setValue(appId);
      }
    }
  }

  protected create(): void {
    if (this.form.invalid || this.saving()) {
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);
    const { appId, environmentId, platform, versionName, buildNumber, notes } =
      this.form.getRawValue();

    this.releasesApi
      .create({
        appId: appId!,
        environmentId: environmentId!,
        platform,
        versionName: versionName.trim(),
        buildNumber: buildNumber ?? null,
        notes: notes.trim() || null,
      })
      .subscribe({
        next: (release) => void this.router.navigate(['/releases', release.id]),
        error: (error: unknown) => {
          this.saveError.set(problemTitle(error) ?? 'Could not create the release.');
          this.saving.set(false);
        },
      });
  }

  private loadEnvironments(appId: number | null): void {
    this.environments.set([]);
    this.form.controls.environmentId.setValue(null);
    if (appId) {
      this.appsApi.get(appId).subscribe((app) => this.environments.set(app.environments));
    }
  }
}
