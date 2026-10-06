import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { anEvent } from '../testing/fixtures';
import { OrganizerEventsPage } from './organizer-events-page';

describe('OrganizerEventsPage', () => {
  let fixture: ComponentFixture<OrganizerEventsPage>;
  let http: HttpTestingController;
  const page = () => fixture.nativeElement as HTMLElement;
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const type = (selector: string, value: string) => {
    const input = page().querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [OrganizerEventsPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(OrganizerEventsPage);
    http = TestBed.inject(HttpTestingController);
    await settle();
  });

  afterEach(() => http.verify());

  it('lists every event, drafts included, with how many tickets are claimed', async () => {
    http
      .expectOne('/api/organizer/events')
      .flush([anEvent(), anEvent({ id: 2, name: 'Planning', status: 'draft', ticketTypes: [] })]);
    await settle();

    const rows = [...page().querySelectorAll('.organizer-events li')].map((li) => li.textContent);
    expect(rows[0]).toContain('Published');
    expect(rows[0]).toContain('38 / 50 claimed');
    expect(rows[1]).toContain('Draft');
  });

  it('creates a draft with the times as instants, then opens it', async () => {
    http.expectOne('/api/organizer/events').flush([]);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    type('#event-name', 'Tech Talks Night');
    type('#event-venue', 'Main Hall');
    type('#event-starts', '2026-11-20T18:00');
    type('#event-ends', '2026-11-20T21:00');
    await settle();

    page().querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    const request = http.expectOne({ method: 'POST', url: '/api/events' });
    expect(request.request.body).toEqual({
      name: 'Tech Talks Night',
      venue: 'Main Hall',
      description: null,
      startsAt: new Date('2026-11-20T18:00').toISOString(),
      endsAt: new Date('2026-11-20T21:00').toISOString(),
    });
    request.flush(anEvent({ id: 7, status: 'draft' }));
    await settle();

    expect(navigate).toHaveBeenCalledWith(['/organizer/events', 7]);
  });

  it('will not create an event that ends before it starts', async () => {
    http.expectOne('/api/organizer/events').flush([]);
    type('#event-name', 'Backwards');
    type('#event-venue', 'Hall');
    type('#event-starts', '2026-11-20T18:00');
    type('#event-ends', '2026-11-20T17:00');
    await settle();

    expect(page().querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    expect(page().querySelector('[role="alert"]')?.textContent).toContain('end after it starts');
  });
});
