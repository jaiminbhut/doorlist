import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

/** Mirrors the API's AppResponse. */
export interface AppSummary {
  id: number;
  name: string;
  createdAt: string;
}

export interface AppEnvironment {
  id: number;
  name: string;
  apiUrl: string;
  isProduction: boolean;
}

export interface AppDetail extends AppSummary {
  environments: AppEnvironment[];
}

export interface NewEnvironment {
  name: string;
  apiUrl: string;
  isProduction: boolean;
}

/** The longest name the API accepts (App.NameMaxLength). */
export const APP_NAME_MAX_LENGTH = 100;

@Injectable({ providedIn: 'root' })
export class AppsApi {
  private readonly http = inject(HttpClient);

  list(): Observable<AppSummary[]> {
    return this.http.get<AppSummary[]>('/api/apps');
  }

  get(id: number): Observable<AppDetail> {
    return this.http.get<AppDetail>(`/api/apps/${id}`);
  }

  create(name: string): Observable<AppSummary> {
    return this.http.post<AppSummary>('/api/apps', { name });
  }

  addEnvironment(appId: number, environment: NewEnvironment): Observable<AppEnvironment> {
    return this.http.post<AppEnvironment>(`/api/apps/${appId}/environments`, environment);
  }
}
