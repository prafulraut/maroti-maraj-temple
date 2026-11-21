import { Component, OnInit } from '@angular/core';
import { PalkhiService } from '../../core/services/palkhi.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-palkhi-tracker',
  templateUrl: './palkhi-tracker.component.html',
  styleUrls: ['./palkhi-tracker.component.css']
})
export class PalkhiTrackerComponent implements OnInit {

  settings: any = null;
  schedules: any[] = [];
  isLoading = true;
  serverBase = environment.apiBase;

  selectedDay = 1;
  days: number[] = [];

  constructor(private palkhiService: PalkhiService) {}

  ngOnInit(): void {
    this.palkhiService.getSettings().subscribe((res: any) => {
      if (res.success) this.settings = res.data;
      this.buildDays();
    });
    this.palkhiService.getSchedules().subscribe({
      next: (res: any) => {
        if (res.success) this.schedules = res.data;
        this.isLoading = false;
        this.buildDays();
        this.selectedDay = this.pickInitialDay();
      },
      error: () => { this.isLoading = false; }
    });
  }

  // ─── Days ─────────────────────────────────────────────────────────────────

  /** Show only days that have stops (falls back to totalDays if none yet) */
  private buildDays(): void {
    const used = Array.from(new Set(this.schedules.map(s => s.dayNumber || 1))).sort((a, b) => a - b);
    if (used.length) {
      this.days = used;
    } else {
      const total = Number(this.settings?.totalDays || 0);
      this.days = Array.from({ length: total }, (_, i) => i + 1);
    }
  }

  /** Open the day where the Palkhi is live, else today's day, else Day 1 */
  private pickInitialDay(): number {
    const live = this.schedules.find(s => s.status === 'in-transit');
    if (live) return live.dayNumber || 1;

    for (const d of this.days) {
      const date = this.dayDate(d);
      if (date && date.toDateString() === new Date().toDateString()) return d;
    }
    return this.days[0] || 1;
  }

  stopsForDay(day: number): any[] {
    return this.schedules
      .filter(s => (s.dayNumber || 1) === day)
      .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
  }

  visitCount(day: number): number {
    return this.stopsForDay(day).filter(s => (s.visitType || 'visit') === 'visit').length;
  }

  mealHost(day: number, type: 'lunch' | 'dinner'): any {
    return this.stopsForDay(day).find(s => s.visitType === type);
  }

  /** Ordered list of villages/cities for the day (consecutive duplicates merged) */
  routeForDay(day: number): string[] {
    const route: string[] = [];
    for (const s of this.stopsForDay(day)) {
      const city = (s.city || '').trim();
      if (city && route[route.length - 1]?.toLowerCase() !== city.toLowerCase()) route.push(city);
    }
    return route;
  }

  dayDate(day: number): Date | null {
    const start = this.settings?.palkhiDate;
    if (!start) return null;
    const [y, m, d] = String(start).split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d + day - 1);
  }

  isDayDone(day: number): boolean {
    const stops = this.stopsForDay(day);
    return stops.length > 0 && stops.every(s => s.status === 'arrived' || s.status === 'completed');
  }

  isDayLive(day: number): boolean {
    return this.stopsForDay(day).some(s => s.status === 'in-transit');
  }

  // ─── Status ───────────────────────────────────────────────────────────────

  statusLabel(status: string): string {
    const map: any = {
      pending: '⏳ Pending',
      'in-transit': '🚗 In Transit',
      arrived: '✅ Arrived',
      completed: '🎉 Completed'
    };
    return map[status] || status;
  }

  statusClass(status: string): string {
    const map: any = {
      pending: 'status-pending',
      'in-transit': 'status-transit',
      arrived: 'status-arrived',
      completed: 'status-completed'
    };
    return map[status] || '';
  }

  hasActiveStop(): boolean {
    return this.schedules.some(s => s.status === 'in-transit');
  }
}
