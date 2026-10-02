import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth';
import { problemTitle } from '../core/problem';
import { ChecklistItem, PLATFORM_LABELS, ReleaseDetail, ReleasesApi } from './releases-api';

@Component({
  selector: 'app-release-detail-page',
  imports: [RouterLink, DatePipe],
  templateUrl: './release-detail-page.html',
})
export class ReleaseDetailPage implements OnInit {
  private readonly api = inject(ReleasesApi);
  protected readonly auth = inject(AuthService);

  /** Bound from the :id route parameter. */
  readonly id = input.required<string>();

  protected readonly platformLabels = PLATFORM_LABELS;
  protected readonly release = signal<ReleaseDetail | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly isShipped = computed(() => this.release()?.status === 'shipped');
  protected readonly canEdit = computed(() => this.auth.canWorkOnReleases() && !this.isShipped());
  protected readonly remaining = computed(
    () => this.release()?.checklist.filter((item) => !item.isDone).length ?? 0,
  );

  /** Why the ship button is disabled, or null when it can be pressed. */
  protected readonly shipBlockedBy = computed(() => {
    const release = this.release();
    if (!release || this.isShipped() || !this.auth.canWorkOnReleases()) {
      return null;
    }
    if (release.isProduction && !this.auth.hasRole('Lead')) {
      return 'Only a lead can ship to production.';
    }
    const remaining = this.remaining();
    if (remaining > 0) {
      return `${remaining} checklist ${remaining === 1 ? 'item is' : 'items are'} still open.`;
    }
    return null;
  });

  ngOnInit(): void {
    this.api.get(Number(this.id())).subscribe({
      next: (release) => this.release.set(release),
      error: (error: HttpErrorResponse) =>
        this.loadError.set(
          error.status === 404 ? 'This release does not exist.' : 'Could not load this release.',
        ),
    });
  }

  protected toggle(item: ChecklistItem, isDone: boolean): void {
    const release = this.release();
    if (!release || this.busy()) {
      return;
    }

    this.busy.set(true);
    this.actionError.set(null);

    this.api.setChecklistItem(release.id, item.id, isDone).subscribe({
      next: (updated) => {
        this.release.set({
          ...release,
          checklist: release.checklist.map((existing) =>
            existing.id === updated.id ? updated : existing,
          ),
        });
        this.busy.set(false);
      },
      error: (error: unknown) => {
        this.actionError.set(problemTitle(error) ?? 'Could not update the checklist.');
        this.busy.set(false);
      },
    });
  }

  protected ship(): void {
    const release = this.release();
    if (!release || this.busy() || this.shipBlockedBy() !== null) {
      return;
    }

    this.busy.set(true);
    this.actionError.set(null);

    this.api.ship(release.id).subscribe({
      next: (shipped) => {
        this.release.set(shipped);
        this.busy.set(false);
      },
      error: (error: unknown) => {
        this.actionError.set(problemTitle(error) ?? 'Could not ship the release.');
        this.busy.set(false);
      },
    });
  }
}
