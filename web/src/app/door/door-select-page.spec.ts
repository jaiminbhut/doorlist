import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { anEvent } from '../testing/fixtures';
import { DoorSelectPage } from './door-select-page';
import { DoorStore } from './door-store';

describe('DoorSelectPage', () => {
  beforeEach(() => localStorage.clear());

  it('lists the events to check in for, and remembers this door name', async () => {
    TestBed.configureTestingModule({
      imports: [DoorSelectPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(DoorSelectPage);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('/api/events').flush([anEvent({ id: 42 })]);
    await fixture.whenStable();
    fixture.detectChanges();

    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('.door-events a')?.getAttribute('href')).toBe('/door/42');

    const name = page.querySelector<HTMLInputElement>('#door-name')!;
    name.value = 'North door';
    name.dispatchEvent(new Event('input'));
    expect(TestBed.inject(DoorStore).doorName()).toBe('North door');
    http.verify();
  });
});
