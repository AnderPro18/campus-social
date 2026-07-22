import { Component, inject, HostListener } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { SearchService } from '../../services/search.service';
import { CommonModule, AsyncPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProfileStateService } from '../../services/profile-state.service';
import { ChatService } from '../../services/chat.service';
import { NotificationService } from '../../services/notification.service';
import { NotificationsPanelComponent } from '../notifications/notifications-panel.component';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [
    CommonModule,
    AsyncPipe,
    FormsModule,
    RouterLink,
    RouterLinkActive,
    NotificationsPanelComponent
  ],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent {

  private auth         = inject(AuthService);
  private router       = inject(Router);
  private search       = inject(SearchService);
  private profileState = inject(ProfileStateService);
  private chatService  = inject(ChatService);
  readonly ns          = inject(NotificationService);

  user$             = this.auth.user$;
  unreadChatsCount$ = this.chatService.getUnreadChatsCount();

  isMenuOpen        = false;
  query             = '';
  results: any[]    = [];
  userResults: any[] = [];
  postResults: any[] = [];
  reelResults: any[] = [];

  isSearching       = false;
  showDropdown      = false;
  profileComplete   = true;
  showNotifications = false;

  private debounceTimer: any;

  constructor() {
    this.profileState.profileComplete$.subscribe(v => {
      this.profileComplete = v;
      this.search.fixUsers();
      this.search.fixPosts();
    });
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.notif-wrapper') && !target.closest('.notif-panel')) {
      this.showNotifications = false;
    }
    if (!target.closest('.user-section')) {
      this.isMenuOpen = false;
    }
  }

  get shouldShowNavbar() { return this.profileComplete; }
  get showIcons()        { return this.router.url.startsWith('/feed'); }

  async onSearch() {
    clearTimeout(this.debounceTimer);
    const term = this.query.trim();
    if (!term) {
      this.results = this.userResults = this.postResults = this.reelResults = [];
      this.isSearching = false;
      return;
    }
    this.isSearching = true;
    this.showDropdown = true;

    this.debounceTimer = setTimeout(async () => {
      try {
        const all = await this.search.searchAll(term);
        this.results = all;
        const t = term.toLowerCase();
        this.userResults  = all.filter((r: any) => r.type === 'user' && r.name?.toLowerCase().startsWith(t));
        this.postResults  = all.filter((r: any) => r.type === 'post' && r.name?.toLowerCase().startsWith(t));
        this.reelResults  = all.filter((r: any) => r.type === 'reel' && (r.name || '').toLowerCase().startsWith(t));
      } catch { this.results = this.userResults = this.postResults = this.reelResults = []; }
      finally  { this.isSearching = false; }
    }, 300);
  }

  onBlur() { setTimeout(() => (this.showDropdown = false), 150); }

  go(path: string) {
    this.router.navigateByUrl(path);
    this.results = this.userResults = this.postResults = this.reelResults = [];
    this.query   = '';
    this.showDropdown = false;
  }

  toggleMenu() { this.isMenuOpen = !this.isMenuOpen; }

  toggleNotifications(event: MouseEvent) {
    event.stopPropagation();
    this.showNotifications = !this.showNotifications;
  }

  logout()     { this.auth.logout().then(() => this.router.navigate(['/login'])); }
  openTeams()  { window.open('https://teams.microsoft.com', '_blank'); }
  openMoodle() { window.open('https://aulasvirtuales.unicamacho.edu.co/login/', '_blank'); }
}