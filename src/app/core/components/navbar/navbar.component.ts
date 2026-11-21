import { Component, ElementRef, HostListener, OnInit } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { NotificationService, ProgramNotification } from '../../services/notification.service';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.css']
})
export class NavbarComponent implements OnInit {
  currentUser$: Observable<any>;
  notifications$: Observable<ProgramNotification[]>;
  unreadCount$: Observable<number>;
  isMenuOpen = false;
  isNotifOpen = false;
  /** Location the admin form fills in by default; shown translated */
  readonly defaultLocation = 'Maroti Maharaj Temple';

  constructor(
    private authService: AuthService,
    private router: Router,
    public translate: TranslateService,
    private notificationService: NotificationService,
    private el: ElementRef
  ) {
    this.currentUser$ = this.authService.currentUser$;
    this.notifications$ = this.notificationService.items$;
    this.unreadCount$ = this.notificationService.unreadCount$;
  }

  ngOnInit(): void {
    this.notificationService.start();
  }

  toggleMenu() {
    this.isMenuOpen = !this.isMenuOpen;
    if (this.isMenuOpen) this.isNotifOpen = false;
  }

  toggleNotifications(event: MouseEvent) {
    event.stopPropagation();
    this.isNotifOpen = !this.isNotifOpen;
    if (this.isNotifOpen) {
      this.isMenuOpen = false;
      this.notificationService.refresh();
    }
  }

  openNotification(n: ProgramNotification) {
    this.notificationService.markAsRead(n._id);
  }

  markAllAsRead(event: MouseEvent) {
    event.stopPropagation();
    this.notificationService.markAllAsRead();
  }

  trackById(_: number, n: ProgramNotification) {
    return n._id;
  }

  // Close the dropdown when clicking outside it or pressing Escape
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.isNotifOpen) return;
    const panel = this.el.nativeElement.querySelector('.notif-wrapper');
    if (panel && !panel.contains(event.target as Node)) {
      this.isNotifOpen = false;
    }
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.isNotifOpen = false;
  }

  logout(event: Event) {
    event.preventDefault();
    this.authService.logout();
    this.isMenuOpen = false;
  }

  switchLanguage(lang: string) {
    this.translate.use(lang);
  }
}
