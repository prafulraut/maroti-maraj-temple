import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Subscription, timer } from 'rxjs';
import { SERVER_BASE } from './gallery.service';

export interface ProgramNotification {
  _id: string;
  title: string;
  description: string;
  date: string;
  time?: string;
  location?: string;
  createdAt: string;
  unread: boolean;
}

const SEEN_KEY = 'notif_seen_ids';
const POLL_MS = 60_000;
const MAX_ITEMS = 20;
const FIRST_VISIT_NEW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Turns programmes (events) added by the admin into notifications.
 * Read/unread state is kept per browser in localStorage, so it works
 * for visitors who are not logged in.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService implements OnDestroy {
  private eventsUrl = `${SERVER_BASE}/api/events`;

  private itemsSubject = new BehaviorSubject<ProgramNotification[]>([]);
  readonly items$ = this.itemsSubject.asObservable();

  private unreadSubject = new BehaviorSubject<number>(0);
  readonly unreadCount$ = this.unreadSubject.asObservable();

  private pollSub?: Subscription;
  private seen = new Set<string>();
  /** First ever load: treat existing programmes as already seen so a new visitor isn't flooded. */
  private firstVisit = false;

  constructor(private http: HttpClient, private zone: NgZone) {
    this.loadSeen();
  }

  /** Begin polling (safe to call more than once). */
  start(): void {
    if (this.pollSub) return;
    // Run the timer outside Angular so it doesn't keep the app "unstable"
    this.zone.runOutsideAngular(() => {
      this.pollSub = timer(0, POLL_MS).subscribe(() => this.zone.run(() => this.refresh()));
    });
  }

  refresh(): void {
    this.http.get<any>(this.eventsUrl).subscribe({
      next: (res) => this.update(res?.data || []),
      error: () => { /* keep the last list; try again on next poll */ },
    });
  }

  markAsRead(id: string): void {
    if (this.seen.has(id)) return;
    this.seen.add(id);
    this.saveSeen();
    this.emit(this.itemsSubject.value.map(n => n._id === id ? { ...n, unread: false } : n));
  }

  markAllAsRead(): void {
    this.itemsSubject.value.forEach(n => this.seen.add(n._id));
    this.saveSeen();
    this.emit(this.itemsSubject.value.map(n => ({ ...n, unread: false })));
  }

  private update(events: any[]): void {
    const list = [...events]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, MAX_ITEMS);

    if (this.firstVisit) {
      // New visitor: only programmes added in the last week count as new
      const cutoff = Date.now() - FIRST_VISIT_NEW_MS;
      list.filter(e => new Date(e.createdAt).getTime() < cutoff).forEach(e => this.seen.add(e._id));
      this.firstVisit = false;
      this.saveSeen();
    }

    this.emit(list.map(e => ({
      _id: e._id,
      title: e.title,
      description: e.description,
      date: e.date,
      time: e.time,
      location: e.location,
      createdAt: e.createdAt,
      unread: !this.seen.has(e._id),
    })));
  }

  private emit(list: ProgramNotification[]): void {
    this.itemsSubject.next(list);
    this.unreadSubject.next(list.filter(n => n.unread).length);
  }

  private loadSeen(): void {
    try {
      const raw = localStorage.getItem(SEEN_KEY);
      if (raw === null) {
        this.firstVisit = true;
        return;
      }
      this.seen = new Set(JSON.parse(raw));
    } catch {
      this.seen = new Set();
    }
  }

  private saveSeen(): void {
    try {
      // Cap the stored list so it doesn't grow forever
      localStorage.setItem(SEEN_KEY, JSON.stringify([...this.seen].slice(-200)));
    } catch { /* storage full / disabled */ }
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
  }
}
