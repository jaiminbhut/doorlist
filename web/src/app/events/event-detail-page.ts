import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth';
import { problemTitle } from '../core/problem';
import { MAX_TICKETS_PER_ATTENDEE, TicketsApi } from '../tickets/tickets-api';
import { DoorlistEvent, EventsApi } from './events-api';

@Component({
  selector: 'app-event-detail-page',
  imports: [ReactiveFormsModule, RouterLink, DatePipe],
  templateUrl: './event-detail-page.html',
  styleUrl: './event-detail-page.css',
})
export class EventDetailPage implements OnInit {
  private readonly eventsApi = inject(EventsApi);
  private readonly ticketsApi = inject(TicketsApi);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  /** Bound from the :id route parameter. */
  readonly id = input.required<string>();

  protected readonly quantities = Array.from({ length: MAX_TICKETS_PER_ATTENDEE }, (_, i) => i + 1);
  protected readonly event = signal<DoorlistEvent | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly claiming = signal(false);
  protected readonly claimError = signal<string | null>(null);

  protected readonly form = new FormGroup({
    ticketTypeId: new FormControl<number | null>(null, { validators: [Validators.required] }),
    quantity: new FormControl(1, { nonNullable: true, validators: [Validators.required] }),
  });

  ngOnInit(): void {
    this.eventsApi.get(Number(this.id())).subscribe({
      next: (event) => {
        this.event.set(event);
        const available = event.ticketTypes.find((type) => type.remaining > 0);
        this.form.controls.ticketTypeId.setValue(available?.id ?? null);
      },
      error: (error: HttpErrorResponse) =>
        this.loadError.set(
          error.status === 404 ? 'This event does not exist.' : 'Could not load this event.',
        ),
    });
  }

  protected claim(): void {
    const event = this.event();
    if (!event || this.form.invalid || this.claiming()) {
      return;
    }

    this.claiming.set(true);
    this.claimError.set(null);
    const { ticketTypeId, quantity } = this.form.getRawValue();

    this.ticketsApi.claim(event.id, ticketTypeId!, quantity).subscribe({
      next: () => void this.router.navigate(['/tickets']),
      error: (error: unknown) => {
        this.claimError.set(problemTitle(error) ?? 'Could not claim tickets. Try again.');
        this.claiming.set(false);
      },
    });
  }
}
