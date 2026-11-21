import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { PalkhiService } from '../../../core/services/palkhi.service';
import { compressImage } from '../../../core/utils/compress-image';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-palkhi-management',
  templateUrl: './palkhi-management.component.html',
  styleUrls: ['./palkhi-management.component.css']
})
export class PalkhiManagementComponent implements OnInit {

  /** Recommended number of home visits per day */
  readonly MIN_VISITS_PER_DAY = 15;
  readonly MAX_VISITS_PER_DAY = 20;

  settingsForm!: FormGroup;
  scheduleForm!: FormGroup;

  selectedFile: File | null = null;
  imagePreview: string | null = null;
  settings: any = {};
  schedules: any[] = [];

  /** Day shown in the "All Registered Stops" table */
  selectedDay = 1;

  settingsMsg = '';
  scheduleMsg = '';
  notifyMsg = '';
  isLoading = false;
  serverBase = environment.apiBase;

  constructor(private fb: FormBuilder, private palkhiService: PalkhiService) {}

  ngOnInit(): void {
    this.settingsForm = this.fb.group({
      palkhiTitle:   ['Maroti Maharaj Palkhi 2024', Validators.required],
      palkhiDate:    [''],
      totalDays:     [8, [Validators.required, Validators.min(1)]],
      startLocation: [''],
      endLocation:   [''],
      description:   [''],
    });

    this.scheduleForm = this.fb.group({
      dayNumber:    [1, Validators.required],
      visitType:    ['visit', Validators.required],
      familyName:   ['', Validators.required],
      mobileNumber: ['', [Validators.required, Validators.pattern('^[0-9]{10}$')]],
      city:         ['', Validators.required],
      address:      [''],
      arrivalTime:  ['', Validators.required],
      timeTaken:    ['', Validators.required],
      orderIndex:   [0],
    });

    this.loadData();
  }

  loadData(): void {
    this.palkhiService.getSettings().subscribe((res: any) => {
      if (res.success) {
        this.settings = res.data;
        this.settingsForm.patchValue(res.data);
        if (res.data.imageUrl) {
          this.imagePreview = this.serverBase + res.data.imageUrl;
        }
      }
    });
    this.palkhiService.getSchedules().subscribe((res: any) => {
      if (res.success) this.schedules = res.data;
    });
  }

  // ─── Day helpers ──────────────────────────────────────────────────────────

  /** [1, 2, …, N] – N = totalDays, or higher if a stop was saved on a later day */
  get days(): number[] {
    const total = Number(this.settings?.totalDays || this.settingsForm?.value.totalDays || 8);
    const maxUsed = Math.max(0, ...this.schedules.map(s => s.dayNumber || 1));
    return Array.from({ length: Math.max(total, maxUsed) }, (_, i) => i + 1);
  }

  stopsForDay(day: number): any[] {
    return this.schedules
      .filter(s => (s.dayNumber || 1) === day)
      .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
  }

  /** Home visits only (lunch/dinner hosts counted separately) */
  visitCount(day: number): number {
    return this.stopsForDay(day).filter(s => (s.visitType || 'visit') === 'visit').length;
  }

  mealHost(day: number, type: 'lunch' | 'dinner'): any {
    return this.stopsForDay(day).find(s => s.visitType === type);
  }

  /** 'ok' | 'low' | 'high' compared with the 15–20 target */
  visitTarget(day: number): 'ok' | 'low' | 'high' {
    const n = this.visitCount(day);
    if (n < this.MIN_VISITS_PER_DAY) return 'low';
    if (n > this.MAX_VISITS_PER_DAY) return 'high';
    return 'ok';
  }

  /** Calendar date for a day, based on the start date (palkhiDate) */
  dayDate(day: number): Date | null {
    const start = this.settings?.palkhiDate;
    if (!start) return null;
    const [y, m, d] = String(start).split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d + day - 1);
  }

  selectDay(day: number): void {
    this.selectedDay = day;
    this.scheduleForm.patchValue({ dayNumber: day });
  }

  // ─── Settings ─────────────────────────────────────────────────────────────

  onFileSelected(event: any): void {
    const file: File = event.target.files[0];
    if (!file) return;
    this.selectedFile = file;
    const reader = new FileReader();
    reader.onload = () => (this.imagePreview = reader.result as string);
    reader.readAsDataURL(file);
  }

  async saveSettings(): Promise<void> {
    if (this.settingsForm.invalid) return;
    this.isLoading = true;
    const fd = new FormData();
    const vals = this.settingsForm.value;
    Object.keys(vals).forEach(k => fd.append(k, vals[k]));
    if (this.selectedFile) {
      // shrink large photos so they fit the server upload limit
      try {
        const img = await compressImage(this.selectedFile);
        fd.append('palkhiImage', img, img.name);
      } catch (err: any) {
        this.isLoading = false;
        this.settingsMsg = '❌ ' + (err?.message || 'Could not read this image.');
        return;
      }
    }

    this.palkhiService.updateSettings(fd).subscribe({
      next: (res: any) => {
        this.isLoading = false;
        this.settingsMsg = res.success ? '✅ Settings saved!' : '❌ Error saving settings.';
        if (res.success) {
          this.settings = res.data;
          if (res.data.imageUrl) this.imagePreview = this.serverBase + res.data.imageUrl;
        }
        setTimeout(() => this.settingsMsg = '', 3000);
      },
      error: () => { this.isLoading = false; this.settingsMsg = '❌ Server error.'; }
    });
  }

  // ─── Stops ────────────────────────────────────────────────────────────────

  addSchedule(): void {
    if (this.scheduleForm.invalid) return;
    const vals = this.scheduleForm.value;
    const day = Number(vals.dayNumber);

    // Only one lunch host and one dinner host per day
    if (vals.visitType !== 'visit' && this.mealHost(day, vals.visitType)) {
      const existing = this.mealHost(day, vals.visitType);
      if (!confirm(`Day ${day} already has a ${vals.visitType} host (${existing.familyName}). Add another?`)) return;
    }

    this.palkhiService.addSchedule({ ...vals, dayNumber: day }).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.schedules.push(res.data);
          this.selectedDay = day;
          // keep the same day selected so the admin can add the next stop quickly
          this.scheduleForm.reset({ dayNumber: day, visitType: 'visit', orderIndex: 0 });
          this.scheduleMsg = `✅ Stop added to Day ${day}!`;
          setTimeout(() => this.scheduleMsg = '', 3000);
        }
      },
      error: () => { this.scheduleMsg = '❌ Server error.'; }
    });
  }

  deleteSchedule(id: string): void {
    if (!confirm('Delete this stop?')) return;
    this.palkhiService.deleteSchedule(id).subscribe((res: any) => {
      if (res.success) this.schedules = this.schedules.filter(s => s._id !== id);
    });
  }

  updateStatus(id: string, status: string): void {
    this.palkhiService.updateStatus(id, status).subscribe((res: any) => {
      if (res.success) {
        const idx = this.schedules.findIndex(s => s._id === id);
        if (idx !== -1) this.schedules[idx].status = status;
      }
    });
  }

  // ─── SMS ──────────────────────────────────────────────────────────────────

  notifyOne(id: string): void {
    this.palkhiService.notifyOne(id).subscribe((res: any) => {
      const s = this.schedules.find(x => x._id === id);
      this.notifyMsg = res.success
        ? `✅ SMS sent to ${s?.familyName}!`
        : `❌ SMS failed.`;
      if (res.success && s) s.smsSent = true;
      setTimeout(() => this.notifyMsg = '', 4000);
    });
  }

  notifyAll(): void {
    if (!confirm('Send SMS to ALL registered families (all days)?')) return;
    this.palkhiService.notifyAll().subscribe((res: any) => {
      this.notifyMsg = res.success
        ? `✅ SMS sent to ${res.results?.length || 0} families!`
        : '❌ Error sending SMS.';
      if (res.success) this.schedules.forEach(s => s.smsSent = true);
      setTimeout(() => this.notifyMsg = '', 5000);
    });
  }

  notifyDay(day: number): void {
    if (!confirm(`Send SMS to all families of Day ${day}?`)) return;
    this.palkhiService.notifyAll(day).subscribe((res: any) => {
      this.notifyMsg = res.success
        ? `✅ SMS sent to ${res.results?.length || 0} families of Day ${day}!`
        : '❌ Error sending SMS.';
      if (res.success) this.stopsForDay(day).forEach(s => s.smsSent = true);
      setTimeout(() => this.notifyMsg = '', 5000);
    });
  }

  statusClass(status: string): string {
    const map: any = { pending: 'badge-pending', 'in-transit': 'badge-transit', arrived: 'badge-arrived', completed: 'badge-completed' };
    return map[status] || 'badge-pending';
  }
}
