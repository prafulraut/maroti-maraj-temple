import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PalkhiService {
  private apiUrl = `${environment.apiBase}/api/palkhi`;

  constructor(private http: HttpClient) {}

  private authHeaders(): HttpHeaders {
    const token = localStorage.getItem('auth_token') || '';
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  // ─── Public ────────────────────────────────────────────────────────────────
  getSettings(): Observable<any> {
    return this.http.get(`${this.apiUrl}/settings`);
  }

  getSchedules(): Observable<any> {
    return this.http.get(`${this.apiUrl}/schedules`);
  }

  // ─── Admin ─────────────────────────────────────────────────────────────────
  updateSettings(formData: FormData): Observable<any> {
    return this.http.post(`${this.apiUrl}/settings`, formData, {
      headers: this.authHeaders(),
    });
  }

  addSchedule(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/schedules`, data, {
      headers: this.authHeaders(),
    });
  }

  deleteSchedule(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/schedules/${id}`, {
      headers: this.authHeaders(),
    });
  }

  updateStatus(id: string, status: string): Observable<any> {
    return this.http.patch(`${this.apiUrl}/schedules/${id}/status`, { status }, {
      headers: this.authHeaders(),
    });
  }

  notifyOne(id: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/notify/${id}`, {}, {
      headers: this.authHeaders(),
    });
  }

  /** Send SMS to all families, or only to the families of one day. */
  notifyAll(day?: number): Observable<any> {
    const q = day ? `?day=${day}` : '';
    return this.http.post(`${this.apiUrl}/notify-all${q}`, {}, {
      headers: this.authHeaders(),
    });
  }
}
