import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import {
  DONATION_PURPOSES, DonationFilters, DonationService, GroupBy, PAYMENT_MODES, PAYMENT_STATUSES,
} from '../../../core/services/donation.service';
import { PalkhiService } from '../../../core/services/palkhi.service';
import { printDonationReceipt } from '../../../core/utils/donation-receipt';

type ViewMode = 'day' | 'month' | 'year' | 'palkhi' | 'range';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

@Component({
  selector: 'app-donation-management',
  templateUrl: './donation-management.component.html',
  styleUrls: ['./donation-management.component.css']
})
export class DonationManagementComponent implements OnInit {
  /** Lets the parent dashboard refresh its "Today's Donations" stat */
  @Output() changed = new EventEmitter<void>();

  purposes = DONATION_PURPOSES;
  modes = PAYMENT_MODES;
  statuses = PAYMENT_STATUSES;
  years: number[] = [];

  // ─── Period selection ──────────────────────────────────────────────────────
  view: ViewMode = 'month';
  day = ymd(new Date());
  month = ymd(new Date()).slice(0, 7);
  year = new Date().getFullYear();
  rangeFrom = ymd(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  rangeTo = ymd(new Date());
  palkhiDayFilter: string = '';        // '' = all Palkhi days

  // ─── Extra filters ─────────────────────────────────────────────────────────
  status = '';
  purpose = '';
  paymentMode = '';
  search = '';

  // ─── Data ──────────────────────────────────────────────────────────────────
  donations: any[] = [];
  summary: any = { groups: [], totals: {}, byPurpose: [], byMode: [] };
  loading = false;
  pendingCount = 0;

  palkhiSettings: any = null;
  palkhiStops: any[] = [];

  // ─── Form ──────────────────────────────────────────────────────────────────
  form!: FormGroup;
  showForm = false;
  editingId: string | null = null;
  saving = false;

  msg = '';
  msgType: 'ok' | 'err' = 'ok';

  constructor(
    private api: DonationService,
    private palkhi: PalkhiService,
    private fb: FormBuilder,
  ) {}

  ngOnInit(): void {
    const thisYear = new Date().getFullYear();
    for (let y = thisYear + 1; y >= thisYear - 10; y--) this.years.push(y);

    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      phone: ['', [Validators.pattern(/^[0-9]{10}$/)]],
      email: ['', [Validators.email]],
      address: [''],
      amount: [null, [Validators.required, Validators.min(1)]],
      purpose: ['General', Validators.required],
      paymentMode: ['Cash', Validators.required],
      transactionId: [''],
      paymentStatus: ['Completed', Validators.required],
      donationDate: [ymd(new Date()), Validators.required],
      palkhiDay: [''],
      palkhiStop: [''],
      message: [''],
      isAnonymous: [false],
    });

    this.form.get('purpose')!.valueChanges.subscribe(() => this.suggestPalkhiDay());
    this.form.get('donationDate')!.valueChanges.subscribe(() => this.suggestPalkhiDay());
    this.form.get('palkhiDay')!.valueChanges.subscribe(() => {
      const stop = this.form.value.palkhiStop;
      if (stop && !this.stopsForDay(this.form.get('palkhiDay')!.value).some(s => s._id === stop)) {
        this.form.patchValue({ palkhiStop: '' }, { emitEvent: false });
      }
    });

    this.palkhi.getSettings().subscribe({ next: (r: any) => (this.palkhiSettings = r.data), error: () => {} });
    this.palkhi.getSchedules().subscribe({ next: (r: any) => (this.palkhiStops = r.data || []), error: () => {} });

    this.load();
  }

  // ═══ Period helpers ═════════════════════════════════════════════════════════
  get palkhiDays(): number[] {
    const n = this.palkhiSettings?.totalDays || 8;
    return Array.from({ length: n }, (_, i) => i + 1);
  }

  setView(v: ViewMode): void {
    this.view = v;
    if (v === 'palkhi' && this.palkhiSettings?.palkhiDate) {
      this.year = Number(this.palkhiSettings.palkhiDate.slice(0, 4)) || this.year;
    }
    this.load();
  }

  private get period(): { from?: Date; to?: Date; groupBy: GroupBy } {
    switch (this.view) {
      case 'day': {
        const from = parseYmd(this.day);
        return { from, to: new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1), groupBy: 'day' };
      }
      case 'month': {
        const [y, m] = this.month.split('-').map(Number);
        return { from: new Date(y, m - 1, 1), to: new Date(y, m, 1), groupBy: 'day' };
      }
      case 'year':
        return { from: new Date(this.year, 0, 1), to: new Date(this.year + 1, 0, 1), groupBy: 'month' };
      case 'palkhi':
        return { from: new Date(this.year, 0, 1), to: new Date(this.year + 1, 0, 1), groupBy: 'palkhiDay' };
      case 'range': {
        const from = parseYmd(this.rangeFrom);
        const end = parseYmd(this.rangeTo);
        return { from, to: new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1), groupBy: 'day' };
      }
    }
  }

  private get filters(): DonationFilters {
    const p = this.period;
    const f: DonationFilters = {
      from: p.from?.toISOString(),
      to: p.to?.toISOString(),
      status: this.status,
      purpose: this.purpose,
      paymentMode: this.paymentMode,
      search: this.search.trim(),
    };
    if (this.view === 'palkhi') f.palkhiDay = this.palkhiDayFilter || 'any';
    return f;
  }

  get periodLabel(): string {
    switch (this.view) {
      case 'day': return parseYmd(this.day).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      case 'month': {
        const [y, m] = this.month.split('-').map(Number);
        return `${MONTHS[m - 1]} ${y}`;
      }
      case 'year': return `Year ${this.year}`;
      case 'palkhi': return `Palkhi ${this.year}${this.palkhiDayFilter ? ' — Day ' + this.palkhiDayFilter : ' — all days'}`;
      case 'range': return `${this.rangeFrom} → ${this.rangeTo}`;
    }
  }

  /** ◀ / ▶ buttons */
  shift(step: number): void {
    if (this.view === 'day') {
      const d = parseYmd(this.day);
      this.day = ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() + step));
    } else if (this.view === 'month') {
      const [y, m] = this.month.split('-').map(Number);
      const d = new Date(y, m - 1 + step, 1);
      this.month = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    } else if (this.view === 'year' || this.view === 'palkhi') {
      this.year += step;
    }
    this.load();
  }

  goToday(): void {
    this.day = ymd(new Date());
    this.month = this.day.slice(0, 7);
    this.year = new Date().getFullYear();
    this.load();
  }

  // ═══ Loading ════════════════════════════════════════════════════════════════
  load(): void {
    if (this.view === 'range' && this.rangeFrom > this.rangeTo) {
      this.flash('"From" date must be before "To" date.', 'err');
      return;
    }
    this.loading = true;
    const f = this.filters;

    this.api.summary(this.period.groupBy, f).subscribe({
      next: (r: any) => (this.summary = r.data),
      error: (e) => this.handleError(e, 'Could not load summary.'),
    });
    this.api.list(f).subscribe({
      next: (r: any) => { this.donations = r.data || []; this.loading = false; },
      error: (e) => { this.loading = false; this.handleError(e, 'Could not load donations.'); },
    });
    this.api.list({ status: 'Pending' }).subscribe({
      next: (r: any) => (this.pendingCount = r.count || 0),
      error: () => {},
    });
  }

  showPending(): void {
    this.status = 'Pending';
    this.view = 'range';
    this.rangeFrom = '2000-01-01';
    this.rangeTo = ymd(new Date());
    this.load();
  }

  clearFilters(): void {
    this.status = this.purpose = this.paymentMode = this.search = '';
    this.palkhiDayFilter = '';
    this.load();
  }

  // ═══ Breakdown table ════════════════════════════════════════════════════════
  get breakdownTitle(): string {
    return { day: 'Day-wise', month: 'Day-wise', year: 'Month-wise', palkhi: 'Palkhi day-wise', range: 'Day-wise' }[this.view];
  }

  groupLabel(g: any): string {
    if (this.view === 'palkhi') {
      const date = this.palkhiDate(g.key);
      return `Day ${g.key}${date ? ' · ' + date : ''}`;
    }
    if (this.summary.groupBy === 'month') {
      const [y, m] = String(g.key).split('-').map(Number);
      return `${MONTHS[m - 1]} ${y}`;
    }
    return parseYmd(String(g.key)).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  }

  /** Calendar date of a Palkhi day, if the configured Palkhi is in the selected year */
  palkhiDate(day: number): string {
    const start = this.palkhiSettings?.palkhiDate;
    if (!start || Number(start.slice(0, 4)) !== this.year) return '';
    const d = parseYmd(start);
    d.setDate(d.getDate() + Number(day) - 1);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  }

  familiesOnDay(day: number): number {
    return this.palkhiStops.filter(s => s.dayNumber === Number(day)).length;
  }

  /** Click a breakdown row to drill down */
  drill(g: any): void {
    if (this.view === 'palkhi') {
      this.palkhiDayFilter = String(g.key);
    } else if (this.summary.groupBy === 'month') {
      this.month = g.key;
      this.view = 'month';
    } else if (this.view !== 'day') {
      this.day = g.key;
      this.view = 'day';
    } else {
      return;
    }
    this.load();
  }

  // ═══ Form ═══════════════════════════════════════════════════════════════════
  stopsForDay(day: any): any[] {
    const n = Number(day);
    return n ? this.palkhiStops.filter(s => s.dayNumber === n) : [];
  }

  /** When purpose is Palkhi, pick the Palkhi day matching the donation date */
  private suggestPalkhiDay(): void {
    const v = this.form.value;
    const purpose = this.form.get('purpose')!.value;
    const date = this.form.get('donationDate')!.value;
    if (purpose !== 'Palkhi' || v.palkhiDay || !date || !this.palkhiSettings?.palkhiDate) return;
    const start = parseYmd(this.palkhiSettings.palkhiDate).getTime();
    const day = Math.round((parseYmd(date).getTime() - start) / 86400000) + 1;
    if (day >= 1 && day <= (this.palkhiSettings.totalDays || 1)) {
      this.form.patchValue({ palkhiDay: String(day) }, { emitEvent: false });
    }
  }

  openNew(): void {
    this.editingId = null;
    const defaultDate = this.view === 'day' ? this.day : ymd(new Date());
    this.form.reset({
      purpose: this.view === 'palkhi' ? 'Palkhi' : 'General',
      paymentMode: 'Cash',
      paymentStatus: 'Completed',
      donationDate: defaultDate,
      palkhiDay: this.view === 'palkhi' ? this.palkhiDayFilter : '',
      palkhiStop: '',
      isAnonymous: false,
    });
    this.suggestPalkhiDay();
    this.showForm = true;
  }

  edit(d: any): void {
    this.editingId = d._id;
    this.form.reset({
      name: d.name,
      phone: d.phone || '',
      email: d.email || '',
      address: d.address || '',
      amount: d.amount,
      purpose: d.purpose,
      paymentMode: d.paymentMode || 'Cash',
      transactionId: d.transactionId || '',
      paymentStatus: d.paymentStatus,
      donationDate: ymd(new Date(d.donationDate || d.createdAt)),
      palkhiDay: d.palkhiDay ? String(d.palkhiDay) : '',
      palkhiStop: d.palkhiStop?._id || d.palkhiStop || '',
      message: d.message || '',
      isAnonymous: !!d.isAnonymous,
    }, { emitEvent: false });
    this.showForm = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancel(): void {
    this.showForm = false;
    this.editingId = null;
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = { ...this.form.value };
    // Keep today's actual time; other dates are stored at midday local time
    v.donationDate = v.donationDate === ymd(new Date())
      ? new Date().toISOString()
      : new Date(`${v.donationDate}T12:00:00`).toISOString();
    v.palkhiDay = v.palkhiDay ? Number(v.palkhiDay) : null;
    v.palkhiStop = v.palkhiStop || null;

    this.saving = true;
    const req = this.editingId ? this.api.update(this.editingId, v) : this.api.create(v);
    req.subscribe({
      next: (r: any) => {
        this.saving = false;
        this.flash(r.message || 'Saved.', 'ok');
        if (!this.editingId && r.data && confirm('Donation saved. Print receipt now?')) {
          printDonationReceipt(r.data);
        }
        this.cancel();
        this.load();
        this.changed.emit();
      },
      error: (e) => { this.saving = false; this.handleError(e, 'Could not save donation.'); },
    });
  }

  // ═══ Row actions ════════════════════════════════════════════════════════════
  setStatus(d: any, s: string): void {
    if (s === 'Failed' && !confirm(`Mark ${d.receiptNo || 'this donation'} as Failed?`)) return;
    this.api.setStatus(d._id, s).subscribe({
      next: (r: any) => { this.flash(r.message, 'ok'); this.load(); this.changed.emit(); },
      error: (e) => this.handleError(e, 'Could not update status.'),
    });
  }

  remove(d: any): void {
    if (!confirm(`Delete donation ${d.receiptNo || ''} of ₹${d.amount} by ${d.name}? This cannot be undone.`)) return;
    this.api.remove(d._id).subscribe({
      next: (r: any) => { this.flash(r.message, 'ok'); this.load(); this.changed.emit(); },
      error: (e) => this.handleError(e, 'Could not delete donation.'),
    });
  }

  print(d: any): void {
    printDonationReceipt(d);
  }

  // ═══ Export ═════════════════════════════════════════════════════════════════
  exportCsv(): void {
    if (!this.donations.length) return;
    const cols = ['Receipt No', 'Date', 'Name', 'Phone', 'Email', 'Address', 'Amount', 'Purpose', 'Palkhi Day',
      'Palkhi Family', 'Payment Mode', 'Transaction/Ref', 'Status', 'Source', 'Message'];
    const cell = (v: any) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = this.donations.map(d => [
      d.receiptNo, ymd(new Date(d.donationDate || d.createdAt)), d.name, d.phone, d.email, d.address, d.amount,
      d.purpose, d.palkhiDay || '', d.palkhiStop?.familyName || '', d.paymentMode, d.transactionId,
      d.paymentStatus, d.source, d.message,
    ].map(cell).join(','));
    const csv = '﻿' + [cols.join(','), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `donations-${this.periodLabel.replace(/[^\w-]+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ═══ Helpers ════════════════════════════════════════════════════════════════
  invalid(name: string): boolean {
    const c = this.form.get(name);
    return !!c && c.touched && c.invalid;
  }

  private handleError(err: any, fallback: string): void {
    this.flash(err?.status === 401 ? 'Your session has expired. Please log in again.' : (err?.error?.message || fallback), 'err');
  }

  private flash(text: string, type: 'ok' | 'err'): void {
    this.msg = text;
    this.msgType = type;
    setTimeout(() => { if (this.msg === text) this.msg = ''; }, 5000);
  }
}
