import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DoorlistEvent, EventsApi } from './events-api';

@Component({
  selector: 'app-events-page',
  imports: [RouterLink, DatePipe],
  templateUrl: './events-page.html',
})
export class EventsPage implements OnInit {
  private readonly api = inject(EventsApi);

  protected readonly events = signal<DoorlistEvent[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  ngOnInit(): void {
    this.api.list().subscribe({
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

  protected remaining(event: DoorlistEvent): number {
    return event.ticketTypes.reduce((sum, type) => sum + type.remaining, 0);
  }
}
