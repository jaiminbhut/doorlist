import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

/** Mirrors the API's AppResponse. */
export interface AppSummary {
  id: number;
  name: string;
  createdAt: string;
}

/** The longest name the API accepts (App.NameMaxLength). */
export const APP_NAME_MAX_LENGTH = 100;

@Injectable({ providedIn: 'root' })
export class AppsApi {
  private readonly http = inject(HttpClient);

  list(): Observable<AppSummary[]> {
    return this.http.get<AppSummary[]>('/api/apps');
  }

  create(name: string): Observable<AppSummary> {
    return this.http.post<AppSummary>('/api/apps', { name });
  }
}
