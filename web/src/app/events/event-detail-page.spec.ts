import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Role } from '../core/auth';
import { provideFakeAuth } from '../testing/fake-auth';
import { EventDetailPage } from './event-detail-page';
import { anEvent } from '../testing/fixtures';

describe('EventDetailPage', () => {
  let fixture: ComponentFixture<EventDetailPage>;
  let http: HttpTestingController;

  const page = () => fixture.nativeElement as HTMLElement;
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  const render = async (event = anEvent(), ...roles: Role[]) => {
    TestBed.configureTestingModule({
      imports: [EventDetailPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideFakeAuth(...roles),
      ],
    });
    fixture = TestBed.createComponent(EventDetailPage);
    fixture.componentRef.setInput('id', String(event.id));
    http = TestBed.inject(HttpTestingController);
    await settle();
    http.expectOne(`/api/events/${event.id}`).flush(event);
    await settle();
  };

  afterEach(() => http.verify());

  it('asks visitors to sign up before claiming', async () => {
    await render();

    expect(page().querySelector('.claim-form')).toBeNull();
    expect(page().querySelector('.sign-up-prompt')?.textContent).toContain('Sign up');
  });

  it('claims the chosen ticket type and quantity, then shows the tickets', async () => {
    await render(anEvent(), 'Attendee');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const quantity = page().querySelector<HTMLSelectElement>('#claim-quantity')!;
    quantity.selectedIndex = 1;
    quantity.dispatchEvent(new Event('change'));
    await settle();

    page().querySelector<HTMLButtonElement>('.claim-form button[type="submit"]')!.click();
    const request = http.expectOne({ method: 'POST', url: '/api/events/1/tickets' });
    expect(request.request.body).toEqual({ ticketTypeId: 10, quantity: 2 });
    request.flush([]);
    await settle();

    expect(navigate).toHaveBeenCalledWith(['/tickets']);
  });

  it("explains the API's refusal, such as the per-attendee limit", async () => {
    await render(anEvent(), 'Attendee');

    page().querySelector<HTMLButtonElement>('.claim-form button[type="submit"]')!.click();
    http
      .expectOne({ method: 'POST', url: '/api/events/1/tickets' })
      .flush(
        { title: 'You can hold at most 4 tickets for an event, and you already have 4.' },
        { status: 409, statusText: 'Conflict' },
      );
    await settle();

    expect(page().querySelector('[role="alert"]')?.textContent).toContain('at most 4 tickets');
  });

  it('does not offer a sold-out ticket type', async () => {
    await render(
      anEvent({
        ticketTypes: [
          { id: 10, name: 'Early bird', capacity: 5, remaining: 0 },
          { id: 11, name: 'General admission', capacity: 50, remaining: 3 },
        ],
      }),
      'Attendee',
    );

    const options = [...page().querySelectorAll<HTMLOptionElement>('#claim-type option')];
    expect(options[0].disabled).toBe(true);
    expect(page().querySelector<HTMLSelectElement>('#claim-type')!.selectedIndex).toBe(1);
  });
});
