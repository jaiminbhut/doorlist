import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DoorlistEvent, EventsApi } from '../events/events-api';
import { DoorStore } from './door-store';

@Component({
  selector: 'app-door-select-page',
  imports: [ReactiveFormsModule, RouterLink, DatePipe],
  templateUrl: './door-select-page.html',
})
export class DoorSelectPage implements OnInit {
  private readonly events = inject(EventsApi);
  private readonly store = inject(DoorStore);

  protected readonly upcoming = signal<DoorlistEvent[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly doorName = new FormControl(this.store.doorName(), { nonNullable: true });

  ngOnInit(): void {
    this.doorName.valueChanges.subscribe((name) => this.store.setDoorName(name));
    this.events.list().subscribe({
      next: (events) => {
        this.upcoming.set(events);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set('Could not load events.');
        this.loading.set(false);
      },
    });
  }
}
