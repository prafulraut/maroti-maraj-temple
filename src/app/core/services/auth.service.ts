import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = `${environment.apiBase}/api/auth`;
  
  // Use BehaviorSubject to hold user state
  private currentUserSubject = new BehaviorSubject(this.getUserFromStorage());
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient, private router: Router) {}

  public get currentUserValue(): any {
    return this.currentUserSubject.value;
  }

  login(email: string, password: string) {
    return this.http.post<any>(`${this.apiUrl}/login`, { email, password }).pipe(
      tap((response:any) => {
        if (response && response.token) {
          localStorage.setItem('auth_token', response.token);
          localStorage.setItem('auth_user', JSON.stringify(response.user));
          this.currentUserSubject.next(response.user);
        }
      })
    );
  }

  register(userData: any) {
    return this.http.post<any>(`${this.apiUrl}/register`, userData).pipe(
      tap((response:any) => {
        if (response && response.token) {
          localStorage.setItem('auth_token', response.token);
          localStorage.setItem('auth_user', JSON.stringify(response.user));
          this.currentUserSubject.next(response.user);
        }
      })
    );
  }

  updateProfile(data: { name?: string; phone?: string; address?: string }) {
    const headers = { Authorization: `Bearer ${this.getToken() || ''}` };
    return this.http.put<any>(`${this.apiUrl}/update-profile`, data, { headers }).pipe(
      tap((response: any) => {
        if (response && response.success && response.data) {
          const merged = { ...this.currentUserValue, ...response.data };
          localStorage.setItem('auth_user', JSON.stringify(merged));
          this.currentUserSubject.next(merged);
        }
      })
    );
  }

  logout() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    this.currentUserSubject.next(null);
    this.router.navigate(['/login']);
  }

  isLoggedIn(): boolean {
    return !!localStorage.getItem('auth_token');
  }

  isAdmin(): boolean {
    const user = this.currentUserValue;
    return user && user.role === 'admin';
  }

  getToken(): string | null {
    return localStorage.getItem('auth_token');
  }

  private getUserFromStorage(): any {
    const user = localStorage.getItem('auth_user');
    return user ? JSON.parse(user) : null;
  }
}
