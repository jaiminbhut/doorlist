import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { problemTitle } from '../core/problem';
import { DoorlistEvent, EventsApi } from '../events/events-api';

@Component({
  selector: 'app-organizer-event-page',
  imports: [ReactiveFormsModule, RouterLink, DatePipe],
  templateUrl: './organizer-event-page.html',
  styleUrl: './organizer-event-page.css',
})
export class OrganizerEventPage implements OnInit {
  private readonly api = inject(EventsApi);

  /** Bound from the :id route parameter. */
  readonly id = input.required<string>();

  protected readonly event = signal<DoorlistEvent | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);

  protected readonly isDraft = computed(() => this.event()?.status === 'draft');
  /** Why Publish is disabled, or null when it can be pressed. */
  protected readonly publishBlockedBy = computed(() =>
    this.event()?.ticketTypes.length === 0 ? 'Add at least one ticket type first.' : null,
  );

  protected readonly typeForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/)],
    }),
    capacity: new FormControl<number | null>(null, {
      validators: [Validators.required, Validators.min(1), Validators.max(100000)],
    }),
  });

  ngOnInit(): void {
    this.api.get(Number(this.id())).subscribe({
      next: (event) => this.event.set(event),
      error: (error: HttpErrorResponse) =>
        this.loadError.set(
          error.status === 404 ? 'This event does not exist.' : 'Could not load this event.',
        ),
    });
  }

  protected addTicketType(): void {
    const event = this.event();
    if (!event || this.typeForm.invalid || this.busy()) {
      return;
    }

    this.busy.set(true);
    this.actionError.set(null);
    const { name, capacity } = this.typeForm.getRawValue();

    this.api.addTicketType(event.id, name.trim(), capacity!).subscribe({
      next: (type) => {
        this.event.set({ ...event, ticketTypes: [...event.ticketTypes, type] });
        this.typeForm.reset();
        this.busy.set(false);
      },
      error: (error: unknown) => {
        this.actionError.set(
          problemTitle(error) ?? 'Could not add the ticket type. Check the name and capacity.',
        );
        this.busy.set(false);
      },
    });
  }

  protected publish(): void {
    const event = this.event();
    if (!event || this.busy() || this.publishBlockedBy() !== null) {
      return;
    }

    this.busy.set(true);
    this.actionError.set(null);

    this.api.publish(event.id).subscribe({
      next: (published) => {
        this.event.set(published);
        this.busy.set(false);
      },
      error: (error: unknown) => {
        this.actionError.set(problemTitle(error) ?? 'Could not publish the event.');
        this.busy.set(false);
      },
    });
  }
}
