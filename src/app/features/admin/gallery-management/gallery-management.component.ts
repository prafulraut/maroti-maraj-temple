import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import {
  GalleryImage, GalleryService, GALLERY_CATEGORIES, MEDIA_ACCEPT, isVideoFile, checkMediaFile,
} from '../../../core/services/gallery.service';

interface PendingFile {
  file: File;
  preview: string;
  isVideo: boolean;
}

const MAX_FILES = 20;

const SKIP_REASONS: Record<string, string> = {
  TYPE: 'not a photo/video',
  IMAGE_SIZE: 'photo over 40 MB',
  GIF_SIZE: 'GIF over 4 MB',
  VIDEO_SIZE: 'video over 50 MB',
};

@Component({
  selector: 'app-gallery-management',
  templateUrl: './gallery-management.component.html',
  styleUrls: ['./gallery-management.component.css']
})
export class GalleryManagementComponent implements OnInit, OnDestroy {

  categories = GALLERY_CATEGORIES;
  readonly accept = MEDIA_ACCEPT;
  form!: FormGroup;

  pending: PendingFile[] = [];
  isDragging = false;
  uploadProgress: number | null = null;
  msg = '';
  msgType: 'ok' | 'err' = 'ok';

  /** Published items */
  images: GalleryImage[] = [];
  /** Visitor submissions waiting for approval */
  submissions: GalleryImage[] = [];
  filterCategory = '';
  editingId: string | null = null;
  editForm!: FormGroup;

  constructor(private fb: FormBuilder, public gallery: GalleryService) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      title:       ['', Validators.maxLength(120)],
      description: ['', Validators.maxLength(500)],
      category:    ['Temple', Validators.required],
    });
    this.editForm = this.fb.group({
      title:       ['', Validators.maxLength(120)],
      description: ['', Validators.maxLength(500)],
      category:    ['Temple', Validators.required],
    });
    this.loadImages();
    this.loadSubmissions();
  }

  ngOnDestroy(): void {
    this.pending.forEach(p => URL.revokeObjectURL(p.preview));
  }

  loadImages(): void {
    this.gallery.getForAdmin('approved', this.filterCategory || undefined).subscribe({
      next: (res: any) => this.images = res.data || [],
      error: () => this.flash('Could not load gallery items.', 'err'),
    });
  }

  loadSubmissions(): void {
    this.gallery.getForAdmin('pending').subscribe({
      next: (res: any) => this.submissions = res.data || [],
      error: () => this.flash('Could not load visitor submissions.', 'err'),
    });
  }

  // ─── File selection ───────────────────────────────────────────────────────
  onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) this.addFiles(Array.from(input.files));
    input.value = '';   // allow choosing the same file again
  }

  onDragOver(e: DragEvent): void {
    e.preventDefault();
    this.isDragging = true;
  }

  onDragLeave(e: DragEvent): void {
    e.preventDefault();
    this.isDragging = false;
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.isDragging = false;
    if (e.dataTransfer?.files) this.addFiles(Array.from(e.dataTransfer.files));
  }

  private addFiles(files: File[]): void {
    const rejected: string[] = [];
    for (const file of files) {
      if (this.pending.length >= MAX_FILES) {
        rejected.push(`${file.name} (max ${MAX_FILES} at once)`);
        continue;
      }
      const problem = checkMediaFile(file);
      if (problem) { rejected.push(`${file.name} (${SKIP_REASONS[problem]})`); continue; }
      this.pending.push({ file, preview: URL.createObjectURL(file), isVideo: isVideoFile(file) });
    }
    if (rejected.length) this.flash('Skipped: ' + rejected.join(', '), 'err');
  }

  removePending(i: number): void {
    URL.revokeObjectURL(this.pending[i].preview);
    this.pending.splice(i, 1);
  }

  clearPending(): void {
    this.pending.forEach(p => URL.revokeObjectURL(p.preview));
    this.pending = [];
  }

  // ─── Upload ───────────────────────────────────────────────────────────────
  /**
   * Uploads files one at a time: photos are compressed in the browser,
   * videos are sent in small pieces (the hosted API accepts ~6 MB per request).
   * Admin uploads are published immediately.
   */
  async upload(): Promise<void> {
    if (!this.pending.length || this.form.invalid || this.uploadProgress !== null) return;

    const details = this.form.value;
    const items = [...this.pending];
    const total = items.length;
    const failed: PendingFile[] = [];
    let uploaded = 0;

    this.uploadProgress = 0;
    for (let i = 0; i < total; i++) {
      try {
        await this.gallery.uploadMedia(items[i].file, details, f => {
          this.uploadProgress = Math.round(100 * (i + f) / total);
        });
        uploaded++;
      } catch (err: any) {
        console.error('Upload failed for', items[i].file.name, err);
        failed.push(items[i]);
      }
    }
    this.uploadProgress = null;

    // keep only failed files in the pending list so the admin can retry
    items.filter(p => !failed.includes(p)).forEach(p => URL.revokeObjectURL(p.preview));
    this.pending = failed;

    if (failed.length === 0) {
      this.flash(`${uploaded} file(s) uploaded successfully.`, 'ok');
      this.form.patchValue({ title: '', description: '' });
    } else {
      this.flash(`${uploaded} uploaded, ${failed.length} failed: ${failed.map(f => f.file.name).join(', ')}. Click Upload to retry.`, 'err');
    }
    if (uploaded) this.loadImages();
  }

  // ─── Visitor submissions ──────────────────────────────────────────────────
  approve(item: GalleryImage): void {
    this.gallery.approve(item._id).subscribe({
      next: () => {
        this.submissions = this.submissions.filter(s => s._id !== item._id);
        this.flash('Approved — now visible in the public gallery.', 'ok');
        this.loadImages();
      },
      error: (err) => this.flash(err?.error?.message || 'Approve failed.', 'err'),
    });
  }

  reject(item: GalleryImage): void {
    if (!confirm('Reject and permanently delete this submission?')) return;
    this.gallery.deleteImage(item._id).subscribe({
      next: () => {
        this.submissions = this.submissions.filter(s => s._id !== item._id);
        this.flash('Submission rejected and deleted.', 'ok');
      },
      error: (err) => this.flash(err?.error?.message || 'Reject failed.', 'err'),
    });
  }

  // ─── Manage existing ──────────────────────────────────────────────────────
  setFilter(cat: string): void {
    this.filterCategory = cat;
    this.loadImages();
  }

  startEdit(img: GalleryImage): void {
    this.editingId = img._id;
    this.editForm.setValue({ title: img.title || '', description: img.description || '', category: img.category });
  }

  cancelEdit(): void {
    this.editingId = null;
  }

  saveEdit(img: GalleryImage): void {
    if (this.editForm.invalid) return;
    this.gallery.updateImage(img._id, this.editForm.value).subscribe({
      next: (res: any) => {
        Object.assign(img, res.data);
        this.editingId = null;
        this.flash('Details updated.', 'ok');
        if (this.filterCategory && img.category !== this.filterCategory) this.loadImages();
      },
      error: (err) => this.flash(err?.error?.message || 'Update failed.', 'err'),
    });
  }

  deleteImage(img: GalleryImage): void {
    const kind = this.gallery.isVideo(img) ? 'video' : 'photo';
    if (!confirm(`Delete this ${kind}${img.title ? ' "' + img.title + '"' : ''}? This cannot be undone.`)) return;
    this.gallery.deleteImage(img._id).subscribe({
      next: () => {
        this.images = this.images.filter(i => i._id !== img._id);
        this.flash(`${kind === 'video' ? 'Video' : 'Photo'} deleted.`, 'ok');
      },
      error: (err) => this.flash(err?.error?.message || 'Delete failed.', 'err'),
    });
  }

  private flash(text: string, type: 'ok' | 'err'): void {
    this.msg = text;
    this.msgType = type;
    setTimeout(() => { if (this.msg === text) this.msg = ''; }, 5000);
  }

  formatSize(bytes: number): string {
    return bytes > 1024 * 1024 ? (bytes / 1024 / 1024).toFixed(1) + ' MB' : Math.round(bytes / 1024) + ' KB';
  }
}
