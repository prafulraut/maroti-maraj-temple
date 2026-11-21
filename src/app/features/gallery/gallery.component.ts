import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import {
  GalleryImage, GalleryService, GALLERY_CATEGORIES, MEDIA_ACCEPT, isVideoFile, checkMediaFile,
} from '../../core/services/gallery.service';
import { AuthService } from '../../core/services/auth.service';

interface SelectedFile {
  file: File;
  preview: string;
  isVideo: boolean;
}

const MAX_SELECTED = 10;

@Component({
  selector: 'app-gallery',
  templateUrl: './gallery.component.html',
  styleUrls: ['./gallery.component.css']
})
export class GalleryComponent implements OnInit, OnDestroy {

  categories = GALLERY_CATEGORIES;
  activeCategory = '';          // '' = All
  images: GalleryImage[] = [];
  isLoading = true;
  error = '';

  lightboxIndex: number | null = null;

  // ─── Share (visitor upload) ────────────────────────────────────────────────
  readonly accept = MEDIA_ACCEPT;
  showShare = false;
  shareForm!: FormGroup;
  selected: SelectedFile[] = [];
  skipped: { name: string; reason: string }[] = [];
  uploadProgress: number | null = null;
  shareDone = false;            // true → show thank-you message
  publishedNow = false;         // admin uploads publish instantly
  shareError = '';

  constructor(
    public gallery: GalleryService,
    private fb: FormBuilder,
    private auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.shareForm = this.fb.group({
      uploaderName: ['', Validators.maxLength(60)],
      category:     ['Devotees', Validators.required],
      title:        ['', Validators.maxLength(120)],
      description:  ['', Validators.maxLength(500)],
    });
    this.load();
  }

  ngOnDestroy(): void {
    this.selected.forEach(s => URL.revokeObjectURL(s.preview));
    document.body.style.overflow = '';
  }

  load(): void {
    this.isLoading = true;
    this.error = '';
    this.gallery.getImages(this.activeCategory || undefined).subscribe({
      next: (res: any) => {
        this.images = res.data || [];
        this.isLoading = false;
      },
      error: () => {
        this.error = 'GALLERY_PAGE.LOAD_ERROR';
        this.isLoading = false;
      }
    });
  }

  selectCategory(cat: string): void {
    if (this.activeCategory === cat) return;
    this.activeCategory = cat;
    this.load();
  }

  // ─── Share panel ───────────────────────────────────────────────────────────
  /** Uploading is admin-only (the API rejects everyone else). */
  get isAdmin(): boolean {
    return !!this.auth.isAdmin();
  }

  toggleShare(): void {
    if (!this.isAdmin) return;
    this.showShare = !this.showShare;
    if (this.showShare) this.resetShare();
  }

  onFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.skipped = [];
    for (const file of Array.from(input.files || [])) {
      if (this.selected.length >= MAX_SELECTED) {
        this.skipped.push({ name: file.name, reason: 'SHARE.ERR_TOO_MANY' });
        continue;
      }
      const problem = checkMediaFile(file);
      if (problem) {
        this.skipped.push({ name: file.name, reason: 'SHARE.ERR_' + problem });
        continue;
      }
      this.selected.push({
        file,
        preview: URL.createObjectURL(file),
        isVideo: isVideoFile(file),
      });
    }
    input.value = '';   // allow choosing the same file again
  }

  removeSelected(i: number): void {
    URL.revokeObjectURL(this.selected[i].preview);
    this.selected.splice(i, 1);
  }

  async submitShare(): Promise<void> {
    if (!this.isAdmin || !this.selected.length || this.shareForm.invalid || this.uploadProgress !== null) return;

    const details = this.shareForm.value;
    const items = [...this.selected];
    const failed: SelectedFile[] = [];
    this.shareError = '';
    this.uploadProgress = 0;

    for (let i = 0; i < items.length; i++) {
      try {
        await this.gallery.uploadMedia(items[i].file, details, f => {
          this.uploadProgress = Math.round(100 * (i + f) / items.length);
        });
      } catch (err: any) {
        console.error('Upload failed for', items[i].file.name, err);
        if (err?.status === 429) this.shareError = 'SHARE.ERR_RATE';
        failed.push(items[i]);
      }
    }
    this.uploadProgress = null;

    items.filter(s => !failed.includes(s)).forEach(s => URL.revokeObjectURL(s.preview));
    this.selected = failed;

    if (failed.length) {
      this.shareError = this.shareError || 'SHARE.ERR_FAILED';
      return;
    }
    this.publishedNow = this.auth.isAdmin();
    this.shareDone = true;
    if (this.publishedNow) this.load();
  }

  resetShare(): void {
    this.selected.forEach(s => URL.revokeObjectURL(s.preview));
    this.selected = [];
    this.skipped = [];
    this.shareDone = false;
    this.shareError = '';
    this.shareForm.patchValue({ title: '', description: '' });
  }

  // ─── Lightbox ──────────────────────────────────────────────────────────────
  open(i: number): void {
    this.lightboxIndex = i;
    document.body.style.overflow = 'hidden';
  }

  close(): void {
    this.lightboxIndex = null;
    document.body.style.overflow = '';
  }

  next(e?: Event): void {
    e?.stopPropagation();
    if (this.lightboxIndex === null) return;
    this.lightboxIndex = (this.lightboxIndex + 1) % this.images.length;
  }

  prev(e?: Event): void {
    e?.stopPropagation();
    if (this.lightboxIndex === null) return;
    this.lightboxIndex = (this.lightboxIndex - 1 + this.images.length) % this.images.length;
  }

  get current(): GalleryImage | null {
    return this.lightboxIndex === null ? null : this.images[this.lightboxIndex];
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (this.lightboxIndex === null) return;
    if (e.key === 'Escape') this.close();
    if (e.key === 'ArrowRight') this.next();
    if (e.key === 'ArrowLeft') this.prev();
  }
}
