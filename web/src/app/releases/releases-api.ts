import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export type Platform = 'android' | 'ios' | 'web';
export type ReleaseStatus = 'inProgress' | 'shipped';

export const PLATFORM_LABELS: Record<Platform, string> = {
  android: 'Android',
  ios: 'iOS',
  web: 'Web',
};

export interface ReleaseSummary {
  id: number;
  appId: number;
  appName: string;
  environmentId: number;
  environmentName: string;
  isProduction: boolean;
  version: string;
  platform: Platform;
  status: ReleaseStatus;
  checklistDone: number;
  checklistTotal: number;
  createdAt: string;
  shippedAt: string | null;
}

export interface ChecklistItem {
  id: number;
  position: number;
  title: string;
  isDone: boolean;
  doneBy: string | null;
  doneAt: string | null;
}

export interface ReleaseDetail {
  id: number;
  appId: number;
  appName: string;
  environmentId: number;
  environmentName: string;
  isProduction: boolean;
  environmentApiUrl: string;
  version: string;
  platform: Platform;
  notes: string | null;
  status: ReleaseStatus;
  createdAt: string;
  createdBy: string;
  shippedAt: string | null;
  shippedBy: string | null;
  checklist: ChecklistItem[];
}

export interface NewRelease {
  appId: number;
  environmentId: number;
  platform: Platform;
  version: string;
  notes: string | null;
}

@Injectable({ providedIn: 'root' })
export class ReleasesApi {
  private readonly http = inject(HttpClient);

  list(appId?: number): Observable<ReleaseSummary[]> {
    const params: Record<string, number> = appId ? { appId } : {};
    return this.http.get<ReleaseSummary[]>('/api/releases', { params });
  }

  get(id: number): Observable<ReleaseDetail> {
    return this.http.get<ReleaseDetail>(`/api/releases/${id}`);
  }

  create(release: NewRelease): Observable<ReleaseDetail> {
    return this.http.post<ReleaseDetail>('/api/releases', release);
  }

  setChecklistItem(releaseId: number, itemId: number, isDone: boolean): Observable<ChecklistItem> {
    return this.http.put<ChecklistItem>(`/api/releases/${releaseId}/checklist/${itemId}`, {
      isDone,
    });
  }

  ship(releaseId: number): Observable<ReleaseDetail> {
    return this.http.post<ReleaseDetail>(`/api/releases/${releaseId}/ship`, null);
  }
}
