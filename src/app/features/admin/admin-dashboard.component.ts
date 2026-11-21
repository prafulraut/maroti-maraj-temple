import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AdminService } from '../../core/services/admin.service';
import { AuthService } from '../../core/services/auth.service';

type Tab = 'overview' | 'donations' | 'gallery' | 'palkhi';

@Component({
  selector: 'app-admin-dashboard',
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.css']
})
export class AdminDashboardComponent implements OnInit {

  activeTab: Tab = 'overview';

  stats = {
    totalUsers: 0,
    activeUsers: 0,
    todaysDonations: 0,
    upcomingEvents: 0,
    galleryImages: 0,
  };

  festivals = [
    { name: 'Maha Shivaratri', date: 'March 8', highlight: true },
    { name: 'Ram Navami', date: 'April 17', highlight: false },
    { name: 'Hanuman Jayanti', date: 'April 23', highlight: true }
  ];

  users: any[] = [];
  userSearch = '';
  events: any[] = [];

  eventForm!: FormGroup;
  showEventForm = false;
  editingEventId: string | null = null;

  msg = '';
  msgType: 'ok' | 'err' = 'ok';
  currentUserId = '';

  constructor(
    private admin: AdminService,
    private auth: AuthService,
    private fb: FormBuilder,
  ) {}

  ngOnInit(): void {
    const u = this.auth.currentUserValue;
    this.currentUserId = u?.id || u?._id || '';

    this.eventForm = this.fb.group({
      title:       ['', Validators.required],
      description: ['', Validators.required],
      date:        ['', Validators.required],
      time:        [''],
      location:    ['Maroti Maharaj Temple'],
    });

    this.loadStats();
    this.loadUsers();
    this.loadEvents();
  }

  // ─── Loaders ───────────────────────────────────────────────────────────────
  loadStats(): void {
    this.admin.getStats().subscribe({
      next: (res: any) => this.stats = { ...this.stats, ...res.data },
      error: (err) => this.handleError(err, 'Could not load stats.'),
    });
  }

  loadUsers(): void {
    this.admin.getUsers().subscribe({
      next: (res: any) => this.users = res.data || [],
      error: (err) => this.handleError(err, 'Could not load users.'),
    });
  }

  loadEvents(): void {
    this.admin.getEvents().subscribe({
      next: (res: any) => this.events = res.data || [],
      error: (err) => this.handleError(err, 'Could not load events.'),
    });
  }

  get filteredUsers(): any[] {
    const q = this.userSearch.trim().toLowerCase();
    if (!q) return this.users;
    return this.users.filter(u =>
      (u.name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.phone || '').includes(q));
  }

  isSelf(u: any): boolean {
    return u._id === this.currentUserId;
  }

  isUpcoming(e: any): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(e.date) >= today;
  }

  // ─── User actions ──────────────────────────────────────────────────────────
  toggleRole(u: any): void {
    const role = u.role === 'admin' ? 'user' : 'admin';
    if (!confirm(`Change ${u.name}'s role to "${role}"?`)) return;
    this.admin.updateUserRole(u._id, role).subscribe({
      next: (res: any) => { Object.assign(u, res.data); this.flash(res.message, 'ok'); this.loadStats(); },
      error: (err) => this.handleError(err, 'Could not change role.'),
    });
  }

  toggleStatus(u: any): void {
    const action = u.isActive ? 'Deactivate' : 'Activate';
    if (!confirm(`${action} ${u.name}'s account?`)) return;
    this.admin.toggleUserStatus(u._id).subscribe({
      next: (res: any) => { Object.assign(u, res.data); this.flash(res.message, 'ok'); this.loadStats(); },
      error: (err) => this.handleError(err, 'Could not update account.'),
    });
  }

  deleteUser(u: any): void {
    if (!confirm(`Permanently delete ${u.name} (${u.email})? This cannot be undone.`)) return;
    this.admin.deleteUser(u._id).subscribe({
      next: (res: any) => {
        this.users = this.users.filter(x => x._id !== u._id);
        this.flash(res.message, 'ok');
        this.loadStats();
      },
      error: (err) => this.handleError(err, 'Could not delete user.'),
    });
  }

  // ─── Event actions ─────────────────────────────────────────────────────────
  openNewEvent(): void {
    this.editingEventId = null;
    this.eventForm.reset({ location: 'Maroti Maharaj Temple' });
    this.showEventForm = true;
  }

  editEvent(e: any): void {
    this.editingEventId = e._id;
    this.eventForm.setValue({
      title: e.title,
      description: e.description,
      date: (e.date || '').substring(0, 10),
      time: e.time || '',
      location: e.location || '',
    });
    this.showEventForm = true;
  }

  cancelEvent(): void {
    this.showEventForm = false;
    this.editingEventId = null;
  }

  saveEvent(): void {
    if (this.eventForm.invalid) {
      this.eventForm.markAllAsTouched();
      return;
    }
    const data = this.eventForm.value;
    const req = this.editingEventId
      ? this.admin.updateEvent(this.editingEventId, data)
      : this.admin.createEvent(data);

    req.subscribe({
      next: () => {
        this.flash(this.editingEventId ? 'Event updated.' : 'Event created.', 'ok');
        this.cancelEvent();
        this.loadEvents();
        this.loadStats();
      },
      error: (err) => this.handleError(err, 'Could not save event.'),
    });
  }

  deleteEvent(e: any): void {
    if (!confirm(`Delete event "${e.title}"?`)) return;
    this.admin.deleteEvent(e._id).subscribe({
      next: () => {
        this.events = this.events.filter(x => x._id !== e._id);
        this.flash('Event deleted.', 'ok');
        this.loadStats();
      },
      error: (err) => this.handleError(err, 'Could not delete event.'),
    });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────
  private handleError(err: any, fallback: string): void {
    if (err?.status === 401) {
      this.flash('Your session has expired. Please log in again.', 'err');
      return;
    }
    this.flash(err?.error?.message || fallback, 'err');
  }

  private flash(text: string, type: 'ok' | 'err'): void {
    this.msg = text;
    this.msgType = type;
    setTimeout(() => { if (this.msg === text) this.msg = ''; }, 5000);
  }
}
