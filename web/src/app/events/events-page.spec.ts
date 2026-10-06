import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { anEvent } from '../testing/fixtures';
import { EventsPage } from './events-page';

describe('EventsPage', () => {
  it('lists upcoming events with what is left, or sold out', async () => {
    TestBed.configureTestingModule({
      imports: [EventsPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(EventsPage);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    http.expectOne('/api/events').flush([
      anEvent(),
      anEvent({
        id: 2,
        name: 'Full House',
        ticketTypes: [{ id: 11, name: 'GA', capacity: 5, remaining: 0 }],
      }),
    ]);
    await fixture.whenStable();
    fixture.detectChanges();

    const rows = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.events li')].map(
      (li) => li.textContent,
    );
    expect(rows[0]).toContain('Tech Talks Night');
    expect(rows[0]).toContain('12 left');
    expect(rows[1]).toContain('Sold out');
    http.verify();
  });
});
