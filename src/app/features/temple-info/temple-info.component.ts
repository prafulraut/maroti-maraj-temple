import { Component, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { GalleryImage, GalleryService } from '../../core/services/gallery.service';

interface Trustee {
  nameMr: string;
  nameEn: string;
  roleKey: string;
  phone?: string;
}

@Component({
  selector: 'app-temple-info',
  templateUrl: './temple-info.component.html',
  styleUrls: ['./temple-info.component.css']
})
export class TempleInfoComponent implements OnInit {

  // Official contact details (source: ssmmss.org)
  readonly contactEmail = 'prafulraut492@gmail.com';
  readonly youtubeHandle = '@marotimaharaj';
  readonly youtubeUrl = 'https://www.youtube.com/@marotimaharaj';
  readonly mapQuery = 'C274+RR3, Salbardi, Maharashtra 444905';
  readonly mapEmbedUrl: SafeResourceUrl;
  readonly directionsUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(this.mapQuery);

  aartiSchedule = [
    { time: '05:00 AM', name: 'Mangala Aarti', description: 'Early morning waking up of the deities.' },
    { time: '08:00 AM', name: 'Shringar Aarti', description: 'After decorating the deities with garments and ornaments.' },
    { time: '12:00 PM', name: 'Rajbhog Aarti', description: 'Midday offering of the main meal.' },
    { time: '07:00 PM', name: 'Sandhya Aarti', description: 'Evening worship during twilight.' },
    { time: '09:00 PM', name: 'Shayan Aarti', description: 'Final aarti before the deities rest.' }
  ];

  // विश्वस्त मंडळ — Board of Trustees (source: ssmmss.org/trustee)
  officeBearers: Trustee[] = [
    // President's number on the source site has only 9 digits, so it is not shown until verified.
    { nameMr: 'डॉ. सौ. नलिनीताई बा. कुर्वे', nameEn: 'Dr. Sau. Nalinitai B. Kurve', roleKey: 'PRESIDENT' },
    { nameMr: 'श्री रामदासजी पुं. गोटे', nameEn: 'Shri Ramdasji P. Gote', roleKey: 'VICE_PRESIDENT', phone: '9604473867' },
    { nameMr: 'श्री विजय पं. भाकरे', nameEn: 'Shri Vijay P. Bhakare', roleKey: 'SECRETARY', phone: '9922096855' },
    { nameMr: 'श्री दादारावजी बी. बरगट', nameEn: 'Shri Dadaraoji B. Bargat', roleKey: 'TREASURER', phone: '9960236353' },
    { nameMr: 'श्री बाळासाहेब भा. ठाकरे', nameEn: 'Shri Balasaheb B. Thakare', roleKey: 'JOINT_SECRETARY', phone: '9689912139' },
  ];

  members: Trustee[] = [
    { nameMr: 'श्री दिगंबरराव रो. ठाकरे', nameEn: 'Shri Digambarrao R. Thakare', roleKey: 'MEMBER' },
    { nameMr: 'श्री प्रा. नारायणराव गं. ठोके', nameEn: 'Shri Prof. Narayanrao G. Thoke', roleKey: 'MEMBER' },
    { nameMr: 'श्री अतुल उर्फ पप्पू वै. देशमुख', nameEn: 'Shri Atul alias Pappu V. Deshmukh', roleKey: 'MEMBER' },
    { nameMr: 'श्री रमेशराव आ. वानखडे', nameEn: 'Shri Rameshrao A. Wankhade', roleKey: 'MEMBER' },
    { nameMr: 'श्री अनिलराव रा. सोमदे', nameEn: 'Shri Anilrao R. Somde', roleKey: 'MEMBER' },
    { nameMr: 'श्री चेतनराव अ. काळमेघ', nameEn: 'Shri Chetanrao A. Kalmegh', roleKey: 'MEMBER' },
    { nameMr: 'श्री प्रमोदराव ना. पराळे', nameEn: 'Shri Pramodrao N. Parale', roleKey: 'MEMBER' },
    { nameMr: 'श्री प्रा. आशिषभाऊ व. देशमुख', nameEn: 'Shri Prof. Ashishbhau V. Deshmukh', roleKey: 'MEMBER' },
  ];

  // Regular activities of the Sevashram (source: ssmmss.org/events-programs)
  programs = [
    { key: 'PUNYATITHI', icon: '🪔' },
    { key: 'NAGDWAR', icon: '🚩' },
    { key: 'PARAYAN', icon: '📖' },
    { key: 'BAL_SANSKAR', icon: '🧒' },
    { key: 'MAHILA', icon: '🙏' },
    { key: 'TREE', icon: '🌳' },
  ];

  // Nagdwar Vari 2026 route, 6–16 March 2026 (source: ssmmss.org/events-programs)
  nagdwarRoute = [
    { date: '06 Mar', key: 'D1' },
    { date: '07 Mar', key: 'D2' },
    { date: '08 Mar', key: 'D3' },
    { date: '09 Mar', key: 'D4' },
    { date: '10 Mar', key: 'D5' },
    { date: '11 Mar', key: 'D6' },
    { date: '12 Mar', key: 'D7' },
    { date: '13 Mar', key: 'D8' },
    { date: '14 Mar', key: 'D9' },
    { date: '15 Mar', key: 'D10' },
    { date: '16 Mar', key: 'D11' },
  ];

  // Shown until the admin uploads real photos
  private defaultGallery = [
    { url: 'assets/images/maharaj.png', alt: 'Main Shrine', labelKey: 'INFO.GALLERY.SHRINE' },
    { url: 'https://images.unsplash.com/photo-1590050752117-238cb0fb12b1?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', alt: 'Festival Celebration', labelKey: 'INFO.GALLERY.FESTIVAL' },
    { url: 'https://images.unsplash.com/photo-1582510003544-4d00b7f74220?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', alt: 'Evening Aarti', labelKey: 'INFO.GALLERY.EVENING_AARTI' }
  ];

  galleryImages: { url: string; alt: string; label?: string; labelKey?: string }[] = this.defaultGallery;

  // "आपले मनोगत" feedback form — opens the visitor's mail app addressed to the Sevashram
  feedbackForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    phone: ['', [Validators.pattern(/^[0-9+\s-]{10,15}$/)]],
    message: ['', [Validators.required, Validators.maxLength(1000)]],
  });
  feedbackSent = false;

  /** '/' shows the welcome page, '/temple-info' the full temple details. */
  readonly isHome: boolean;

  /** Quick links at the top of the Temple Info page */
  readonly infoLinks = [
    { id: 'about', key: 'INFO.ABOUT_TITLE' },
    { id: 'timings', key: 'INFO.TIMINGS_TITLE' },
    { id: 'programs', key: 'INFO.PROGRAMS_TITLE' },
    { id: 'vari', key: 'INFO.VARI_TITLE' },
    { id: 'trustees', key: 'INFO.TRUSTEES_TITLE' },
    { id: 'visit', key: 'LOCATION.TITLE' },
  ];

  constructor(
    route: ActivatedRoute,
    private gallery: GalleryService,
    private fb: FormBuilder,
    public translate: TranslateService,
    sanitizer: DomSanitizer,
  ) {
    this.isHome = route.snapshot.data['page'] !== 'info';
    // Constant, trusted URL — safe to bypass sanitization
    this.mapEmbedUrl = sanitizer.bypassSecurityTrustResourceUrl(
      'https://maps.google.com/maps?q=' + encodeURIComponent(this.mapQuery) + '&z=15&output=embed'
    );
  }

  ngOnInit(): void {
    this.gallery.getImages(undefined, 6, 'image').subscribe({
      next: (res: any) => {
        const imgs: GalleryImage[] = res.data || [];
        if (imgs.length) {
          this.galleryImages = imgs.map(img => ({
            url: this.gallery.imageSrc(img),
            alt: img.title || img.category,
            label: img.title || undefined,
            labelKey: img.title ? undefined : 'GALLERY_PAGE.CAT.' + img.category.toUpperCase(),
          }));
        }
      },
      error: () => { /* keep default images */ }
    });
  }

  scrollTo(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  trusteeName(t: Trustee): string {
    const lang = this.translate.currentLang || this.translate.defaultLang;
    return lang === 'en' ? t.nameEn : t.nameMr;
  }

  sendFeedback(): void {
    if (this.feedbackForm.invalid) {
      this.feedbackForm.markAllAsTouched();
      return;
    }
    const { name, phone, message } = this.feedbackForm.value;
    const subject = `Website feedback from ${name}`;
    const body = `${message}\n\n— ${name}${phone ? ' (' + phone + ')' : ''}`;
    window.location.href = `mailto:${this.contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    this.feedbackSent = true;
    this.feedbackForm.reset();
  }
}
