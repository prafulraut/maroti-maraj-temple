import { Component, OnInit } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { AuthService } from '../../core/services/auth.service';
import { DonationService } from '../../core/services/donation.service';

/**
 * Public Donate page: shows how to pay (QR / UPI / bank / at the temple).
 * Donations themselves are recorded only by the admin from the Admin panel.
 */
@Component({
  selector: 'app-donate',
  templateUrl: './donate.component.html',
  styleUrls: ['./donate.component.css']
})
export class DonateComponent implements OnInit {
  config: any = { upiId: '', payeeName: 'Maroti Maharaj Temple', bankDetails: '' };
  isLoggedIn = false;

  constructor(
    private donations: DonationService,
    private auth: AuthService,
    private sanitizer: DomSanitizer,
  ) {}

  ngOnInit(): void {
    this.isLoggedIn = !!this.auth.currentUserValue;
    this.donations.getConfig().subscribe({
      next: (res: any) => (this.config = { ...this.config, ...res.data }),
      error: () => {},
    });
  }

  /** upi:// link opens GPay / PhonePe / Paytm on mobile */
  get upiLink(): SafeUrl | null {
    if (!this.config.upiId) return null;
    const url = `upi://pay?pa=${encodeURIComponent(this.config.upiId)}&pn=${encodeURIComponent(this.config.payeeName)}`
      + `&cu=INR&tn=${encodeURIComponent('Donation')}`;
    return this.sanitizer.bypassSecurityTrustUrl(url);
  }
}
