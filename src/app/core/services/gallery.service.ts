import { Injectable } from '@angular/core';
import { HttpClient, HttpEvent, HttpEventType, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, lastValueFrom } from 'rxjs';
import { filter } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { compressImage } from '../utils/compress-image';

export interface GalleryImage {
  _id: string;
  title: string;
  description: string;
  category: string;
  /** URL of the media file (photo or video) */
  imageUrl: string;
  mediaType?: 'image' | 'video';
  status?: 'pending' | 'approved';
  uploaderName?: string;
  createdAt: string;
}

export interface MediaDetails {
  title?: string;
  description?: string;
  category: string;
  uploaderName?: string;
}

export const SERVER_BASE = environment.apiBase;

export const GALLERY_CATEGORIES = ['Temple', 'Festival', 'Aarti', 'Palkhi', 'Devotees', 'Other'];

// Extensions used when the browser/OS doesn't report a MIME type (common for HEIC, MKV, …)
const IMAGE_EXT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg', pjpeg: 'image/jpeg', pjp: 'image/jpeg',
  png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif',
  heic: 'image/heic', heif: 'image/heif', tif: 'image/tiff', tiff: 'image/tiff',
  svg: 'image/svg+xml', ico: 'image/x-icon',
};
const VIDEO_EXT: Record<string, string> = {
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  mkv: 'video/x-matroska', avi: 'video/x-msvideo', '3gp': 'video/3gpp', '3g2': 'video/3gpp2',
  mpeg: 'video/mpeg', mpg: 'video/mpeg', ogv: 'video/ogg', wmv: 'video/x-ms-wmv', flv: 'video/x-flv',
};

/** File-picker filter: every image and video format. */
export const MEDIA_ACCEPT = 'image/*,video/*,' + [...Object.keys(IMAGE_EXT), ...Object.keys(VIDEO_EXT)].map(e => '.' + e).join(',');

const ext = (file: File) => (file.name.split('.').pop() || '').toLowerCase();

/** Best-guess MIME type (uses the extension when the browser reports none). */
export function mediaType(file: File): string {
  if (file.type && file.type !== 'application/octet-stream') return file.type;
  return IMAGE_EXT[ext(file)] || VIDEO_EXT[ext(file)] || '';
}

export const isVideoFile = (file: File) => mediaType(file).startsWith('video/');
export const isImageFile = (file: File) => mediaType(file).startsWith('image/');

export const MAX_VIDEO_SIZE = 50 * 1024 * 1024;   // must match backend/utils/videoStore.js
export const MAX_IMAGE_SIZE = 40 * 1024 * 1024;   // photos are compressed before upload
export const MAX_GIF_SIZE = 4 * 1024 * 1024;      // GIFs are not compressed (server limit)

/** Returns an error key if the file can't be uploaded, or null if it's fine. */
export function checkMediaFile(file: File): 'TYPE' | 'IMAGE_SIZE' | 'GIF_SIZE' | 'VIDEO_SIZE' | null {
  if (isVideoFile(file)) return file.size > MAX_VIDEO_SIZE ? 'VIDEO_SIZE' : null;
  if (!isImageFile(file)) return 'TYPE';
  if (mediaType(file) === 'image/gif' && file.size > MAX_GIF_SIZE) return 'GIF_SIZE';
  if (file.size > MAX_IMAGE_SIZE) return 'IMAGE_SIZE';
  return null;
}

@Injectable({ providedIn: 'root' })
export class GalleryService {
  private apiUrl = `${SERVER_BASE}/api/gallery`;

  constructor(private http: HttpClient) {}

  /** Sends the login token when there is one (admins' uploads publish instantly). */
  private authHeaders(): HttpHeaders {
    const token = localStorage.getItem('auth_token');
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  /** Full URL for a media path returned by the API (e.g. /api/images/123) */
  imageSrc(img: GalleryImage): string {
    const url = img.imageUrl.startsWith('http') ? img.imageUrl : SERVER_BASE + img.imageUrl;
    // ?v= changes the URL so browsers drop copies cached before the server-side audio repair
    return this.isVideo(img) && img.imageUrl.startsWith('/api/videos/') ? url + '?v=2' : url;
  }

  isVideo(img: GalleryImage): boolean {
    return img.mediaType === 'video';
  }

  // ─── Public ────────────────────────────────────────────────────────────────
  getImages(category?: string, limit?: number, type?: 'image' | 'video'): Observable<any> {
    let params = new HttpParams();
    if (category) params = params.set('category', category);
    if (limit) params = params.set('limit', String(limit));
    if (type) params = params.set('type', type);
    return this.http.get(this.apiUrl, { params });
  }

  /** Upload photo(s) with progress events. Works with or without login. */
  uploadImages(formData: FormData): Observable<HttpEvent<any>> {
    return this.http.post(this.apiUrl, formData, {
      headers: this.authHeaders(),
      reportProgress: true,
      observe: 'events',
    });
  }

  /**
   * Upload a video in small pieces (the hosted API accepts ~6 MB per request).
   * Works with or without login. Resolves with the server's final response.
   */
  async uploadVideo(file: File, details: MediaDetails, onProgress?: (fraction: number) => void): Promise<any> {
    const start: any = await lastValueFrom(this.http.post(`${this.apiUrl}/videos/start`, {
      ...details,
      size: file.size,
      contentType: mediaType(file),
      fileName: file.name,
    }, { headers: this.authHeaders() }));

    const { videoId, uploadToken, chunkSize, chunkCount } = start.data;
    const headers = new HttpHeaders({
      'Content-Type': 'application/octet-stream',
      'X-Upload-Token': uploadToken,
    });

    for (let n = 0; n < chunkCount; n++) {
      const piece = file.slice(n * chunkSize, Math.min(file.size, (n + 1) * chunkSize));
      // retry each piece a few times so a flaky mobile connection doesn't lose the upload
      for (let attempt = 1; ; attempt++) {
        try {
          await lastValueFrom(this.http.put(`${this.apiUrl}/videos/${videoId}/chunks/${n}`, piece, { headers }));
          break;
        } catch (err) {
          if (attempt >= 3) throw err;
          await new Promise(r => setTimeout(r, 1000 * attempt));
        }
      }
      onProgress?.((n + 1) / chunkCount);
    }

    return lastValueFrom(this.http.post(`${this.apiUrl}/videos/${videoId}/finish`, {}, {
      headers: new HttpHeaders({ 'X-Upload-Token': uploadToken }),
    }));
  }

  /** Upload one photo or video. onProgress receives 0..1 for this file. */
  async uploadMedia(file: File, details: MediaDetails, onProgress?: (fraction: number) => void): Promise<any> {
    if (isVideoFile(file)) return this.uploadVideo(file, details, onProgress);

    let photo = await compressImage(file);
    // Make sure the server sees a proper image type even if the OS reported none
    if (!photo.type || photo.type === 'application/octet-stream') {
      photo = new File([photo], photo.name, { type: mediaType(photo) || 'image/jpeg' });
    }
    const fd = new FormData();
    fd.append('title', details.title || '');
    fd.append('description', details.description || '');
    fd.append('category', details.category);
    fd.append('uploaderName', details.uploaderName || '');
    fd.append('images', photo, photo.name);

    const done: any = await lastValueFrom(
      this.uploadImages(fd).pipe(
        filter(event => {
          if (event.type === HttpEventType.UploadProgress && event.total) {
            onProgress?.(event.loaded / event.total);
          }
          return event.type === HttpEventType.Response;
        }),
      ),
    );
    onProgress?.(1);
    return done.body;
  }

  // ─── Admin ─────────────────────────────────────────────────────────────────
  /** All items including visitor submissions waiting for approval */
  getForAdmin(status?: 'pending' | 'approved', category?: string): Observable<any> {
    let params = new HttpParams();
    if (status) params = params.set('status', status);
    if (category) params = params.set('category', category);
    return this.http.get(`${this.apiUrl}/manage`, { params, headers: this.authHeaders() });
  }

  approve(id: string): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}/approve`, {}, { headers: this.authHeaders() });
  }

  updateImage(id: string, data: Partial<GalleryImage>): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, data, { headers: this.authHeaders() });
  }

  deleteImage(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`, { headers: this.authHeaders() });
  }
}
