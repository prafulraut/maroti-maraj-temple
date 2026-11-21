import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { SERVER_BASE } from './gallery.service';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private adminUrl = `${SERVER_BASE}/api/admin`;
  private eventsUrl = `${SERVER_BASE}/api/events`;

  constructor(private http: HttpClient) {}

  private authHeaders(): HttpHeaders {
    const token = localStorage.getItem('auth_token') || '';
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  // ─── Dashboard ─────────────────────────────────────────────────────────────
  getStats(): Observable<any> {
    return this.http.get(`${this.adminUrl}/dashboard`, { headers: this.authHeaders() });
  }

  // ─── Users ─────────────────────────────────────────────────────────────────
  getUsers(): Observable<any> {
    return this.http.get(`${this.adminUrl}/users`, { headers: this.authHeaders() });
  }

  updateUserRole(id: string, role: 'user' | 'admin'): Observable<any> {
    return this.http.put(`${this.adminUrl}/users/${id}/role`, { role }, { headers: this.authHeaders() });
  }

  toggleUserStatus(id: string): Observable<any> {
    return this.http.put(`${this.adminUrl}/users/${id}/toggle-status`, {}, { headers: this.authHeaders() });
  }

  deleteUser(id: string): Observable<any> {
    return this.http.delete(`${this.adminUrl}/users/${id}`, { headers: this.authHeaders() });
  }

  // ─── Events ────────────────────────────────────────────────────────────────
  getEvents(): Observable<any> {
    return this.http.get(this.eventsUrl);
  }

  createEvent(data: any): Observable<any> {
    return this.http.post(this.eventsUrl, data, { headers: this.authHeaders() });
  }

  updateEvent(id: string, data: any): Observable<any> {
    return this.http.put(`${this.eventsUrl}/${id}`, data, { headers: this.authHeaders() });
  }

  deleteEvent(id: string): Observable<any> {
    return this.http.delete(`${this.eventsUrl}/${id}`, { headers: this.authHeaders() });
  }
}
