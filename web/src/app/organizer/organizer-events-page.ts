import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { problemTitle } from '../core/problem';
import { DoorlistEvent, EventsApi } from '../events/events-api';

@Component({
  selector: 'app-organizer-events-page',
  imports: [ReactiveFormsModule, RouterLink, DatePipe],
  templateUrl: './organizer-events-page.html',
  styleUrl: './organizer-events-page.css',
})
export class OrganizerEventsPage implements OnInit {
  private readonly api = inject(EventsApi);
  private readonly router = inject(Router);

  protected readonly events = signal<DoorlistEvent[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);

  protected readonly form = new FormGroup(
    {
      name: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.pattern(/\S/)],
      }),
      venue: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.pattern(/\S/)],
      }),
      description: new FormControl('', { nonNullable: true }),
      startsAt: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      endsAt: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    },
    { validators: endsAfterStart },
  );

  ngOnInit(): void {
    this.api.listForOrganizers().subscribe({
      next: (events) => {
        this.events.set(events);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set('Could not load events.');
        this.loading.set(false);
      },
    });
  }

  protected issued(event: DoorlistEvent): number {
    return event.ticketTypes.reduce((sum, type) => sum + type.capacity - type.remaining, 0);
  }

  protected capacity(event: DoorlistEvent): number {
    return event.ticketTypes.reduce((sum, type) => sum + type.capacity, 0);
  }

  protected create(): void {
    if (this.form.invalid || this.saving()) {
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);
    const { name, venue, description, startsAt, endsAt } = this.form.getRawValue();

    this.api
      .create({
        name: name.trim(),
        venue: venue.trim(),
        description: description.trim() || null,
        // datetime-local is in the organizer's own time zone; the API stores an instant.
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
      })
      .subscribe({
        next: (event) => void this.router.navigate(['/organizer/events', event.id]),
        error: (error: unknown) => {
          this.saveError.set(
            problemTitle(error) ?? 'Could not create the event. Check the details.',
          );
          this.saving.set(false);
        },
      });
  }
}

function endsAfterStart(group: AbstractControl): ValidationErrors | null {
  const { startsAt, endsAt } = group.value as { startsAt: string; endsAt: string };
  return startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)
    ? { endsBeforeStart: true }
    : null;
}
