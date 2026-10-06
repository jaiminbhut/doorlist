import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { anEvent } from '../testing/fixtures';
import { OrganizerEventPage } from './organizer-event-page';

describe('OrganizerEventPage', () => {
  let fixture: ComponentFixture<OrganizerEventPage>;
  let http: HttpTestingController;
  const page = () => fixture.nativeElement as HTMLElement;
  const publishButton = () => page().querySelector<HTMLButtonElement>('.publish-row button');
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [OrganizerEventPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(OrganizerEventPage);
    fixture.componentRef.setInput('id', '7');
    http = TestBed.inject(HttpTestingController);
    await settle();
    http.expectOne('/api/events/7').flush(anEvent({ id: 7, status: 'draft', ticketTypes: [] }));
    await settle();
  });

  afterEach(() => http.verify());

  it('adds a ticket type, which unlocks publishing, then publishes', async () => {
    expect(publishButton()!.disabled).toBe(true);
    expect(page().querySelector('.notice')?.textContent).toContain('Add at least one ticket type');

    for (const [selector, value] of [
      ['#type-name', 'General admission'],
      ['#type-capacity', '50'],
    ]) {
      const input = page().querySelector<HTMLInputElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
    await settle();
    page().querySelector<HTMLButtonElement>('.type-form button[type="submit"]')!.click();
    const added = http.expectOne({ method: 'POST', url: '/api/events/7/ticket-types' });
    expect(added.request.body).toEqual({ name: 'General admission', capacity: 50 });
    added.flush({ id: 10, name: 'General admission', capacity: 50, remaining: 50 });
    await settle();

    expect(publishButton()!.disabled).toBe(false);
    publishButton()!.click();
    http.expectOne({ method: 'POST', url: '/api/events/7/publish' }).flush(anEvent({ id: 7 }));
    await settle();

    expect(publishButton()).toBeNull();
    expect(page().textContent).toContain('Published.');
    expect(page().querySelector('.tag.published.stamped')).not.toBeNull();
  });
});
