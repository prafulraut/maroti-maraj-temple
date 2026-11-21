import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type GroupBy = 'day' | 'month' | 'year' | 'palkhiDay';

export interface DonationFilters {
  from?: string;          // ISO date-time, inclusive
  to?: string;            // ISO date-time, exclusive
  status?: string;
  purpose?: string;
  paymentMode?: string;
  palkhiDay?: string | number;   // number | 'any' | 'none'
  search?: string;
}

export const DONATION_PURPOSES = ['General', 'Temple Maintenance', 'Festival', 'Palkhi', 'Food Distribution', 'Education', 'Other'];
export const PAYMENT_MODES = ['Cash', 'UPI', 'Online', 'Cheque', 'Bank Transfer', 'Other'];
export const PAYMENT_STATUSES = ['Pending', 'Completed', 'Failed'];

@Injectable({ providedIn: 'root' })
export class DonationService {
  private url = `${environment.apiBase}/api/donations`;

  constructor(private http: HttpClient) {}

  private headers(): HttpHeaders {
    const token = localStorage.getItem('auth_token');
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  private params(f: DonationFilters & { groupBy?: GroupBy } = {}): HttpParams {
    let p = new HttpParams();
    Object.entries(f).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
    });
    return p;
  }

  // ─── Public / user ─────────────────────────────────────────────────────────
  getConfig(): Observable<any> {
    return this.http.get(`${this.url}/config`);
  }

  donate(data: any): Observable<any> {
    return this.http.post(this.url, data, { headers: this.headers() });
  }

  getMine(): Observable<any> {
    return this.http.get(`${this.url}/my`, { headers: this.headers() });
  }

  // ─── Admin ─────────────────────────────────────────────────────────────────
  list(filters: DonationFilters): Observable<any> {
    return this.http.get(this.url, { headers: this.headers(), params: this.params(filters) });
  }

  summary(groupBy: GroupBy, filters: DonationFilters): Observable<any> {
    return this.http.get(`${this.url}/summary`, {
      headers: this.headers(),
      params: this.params({ ...filters, groupBy }),
    });
  }

  create(data: any): Observable<any> {
    return this.http.post(`${this.url}/admin`, data, { headers: this.headers() });
  }

  update(id: string, data: any): Observable<any> {
    return this.http.put(`${this.url}/${id}`, data, { headers: this.headers() });
  }

  setStatus(id: string, paymentStatus: string): Observable<any> {
    return this.http.patch(`${this.url}/${id}/status`, { paymentStatus }, { headers: this.headers() });
  }

  remove(id: string): Observable<any> {
    return this.http.delete(`${this.url}/${id}`, { headers: this.headers() });
  }
}
