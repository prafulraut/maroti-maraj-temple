import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from 'src/app/core/services/auth.service';
import { environment } from 'src/environments/environment';
import { DonationService } from 'src/app/core/services/donation.service';
import { printDonationReceipt } from 'src/app/core/utils/donation-receipt';

type Panel = 'none' | 'profile' | 'events' | 'donations';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit {
  user: any;
  activePanel: Panel = 'none';

  // Profile
  profileForm: FormGroup;
  savingProfile = false;
  profileMessage = '';
  profileError = '';

  // Events
  events: any[] = [];
  loadingEvents = false;
  eventsError = '';

  // Donations
  donations: any[] = [];
  donationTotal = 0;
  loadingDonations = false;
  donationsError = '';

  private apiBase = environment.apiBase;

  constructor(
    private authService: AuthService,
    private http: HttpClient,
    private fb: FormBuilder,
    private donationService: DonationService
  ) {
    this.user = this.authService.currentUserValue;
    this.profileForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      phone: ['', [Validators.pattern(/^[0-9]{10}$/)]],
      address: ['']
    });
  }

  ngOnInit(): void {
    this.authService.currentUser$.subscribe(u => (this.user = u));
  }

  private togglePanel(panel: Panel): boolean {
    this.activePanel = this.activePanel === panel ? 'none' : panel;
    return this.activePanel === panel;
  }

  closePanel(): void {
    this.activePanel = 'none';
  }

  // ─── Edit Profile ──────────────────────────────────────────────────────────
  openProfile(): void {
    if (!this.togglePanel('profile')) return;
    this.profileMessage = '';
    this.profileError = '';
    this.profileForm.reset({
      name: this.user?.name || '',
      phone: this.user?.phone || '',
      address: this.user?.address || ''
    });
  }

  saveProfile(): void {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }
    this.savingProfile = true;
    this.profileMessage = '';
    this.profileError = '';
    this.authService.updateProfile(this.profileForm.value).subscribe({
      next: (res: any) => {
        this.savingProfile = false;
        this.profileMessage = res?.message || 'Profile updated successfully.';
      },
      error: (err) => {
        this.savingProfile = false;
        this.profileError = err?.error?.message || 'Could not update profile. Please try again.';
      }
    });
  }

  // ─── Events ────────────────────────────────────────────────────────────────
  openEvents(): void {
    if (!this.togglePanel('events')) return;
    this.loadingEvents = true;
    this.eventsError = '';
    this.http.get<any>(`${this.apiBase}/api/events`).subscribe({
      next: (res) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        this.events = (res?.data || []).filter((e: any) => new Date(e.date) >= today);
        this.loadingEvents = false;
      },
      error: (err) => {
        this.eventsError = err?.error?.message || 'Could not load events.';
        this.loadingEvents = false;
      }
    });
  }

  // ─── Donations ─────────────────────────────────────────────────────────────
  openDonations(): void {
    if (!this.togglePanel('donations')) return;
    this.loadingDonations = true;
    this.donationsError = '';
    this.donationService.getMine().subscribe({
      next: (res: any) => {
        this.donations = res?.data || [];
        this.donationTotal = res?.total || 0;
        this.loadingDonations = false;
      },
      error: (err) => {
        this.donationsError = err?.error?.message || 'Could not load donations.';
        this.loadingDonations = false;
      }
    });
  }

  get pendingDonationTotal(): number {
    return this.donations
      .filter(d => d.paymentStatus === 'Pending')
      .reduce((sum, d) => sum + d.amount, 0);
  }

  printReceipt(d: any): void {
    printDonationReceipt(d);
  }
}
