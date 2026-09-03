import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { SearchService } from '../../services/search.service';
import { CommonModule, AsyncPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProfileStateService } from '../../services/profile-state.service';
import { ChatService } from '../../services/chat.service';
import {
  Firestore,
  collection,
  collectionData,
  query,
  orderBy,
  doc,
  updateDoc
} from '@angular/fire/firestore';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, AsyncPipe, FormsModule, RouterLink, RouterLinkActive],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent {

  private auth = inject(AuthService);
  private router = inject(Router);
  private search = inject(SearchService);
  private profileState = inject(ProfileStateService);
  private firestore = inject(Firestore);
  private chatService = inject(ChatService);

  user$ = this.auth.user$;
  unreadChatsCount$ = this.chatService.getUnreadChatsCount();

  isMenuOpen = false;
  query = '';
  avatarError = false;

  getInitial(name?: string | null): string {
    const trimmed = (name || '').trim();
    return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
  }

  results: any[] = [];
  userResults: any[] = [];
  postResults: any[] = [];
  reelResults: any[] = [];
  notifications: any[] = [];

  isSearching = false;
  showDropdown = false;
  profileComplete = true;
  showNotifications = false;

  private debounceTimer: any;

  constructor() {
  this.profileState.profileComplete$.subscribe(v => {
    this.profileComplete = v;

    this.search.fixUsers();
    this.search.fixPosts();
  });

  this.loadNotifications();
}

  get shouldShowNavbar() {
    return this.profileComplete;
  }

  get showIcons() {
    return this.router.url.startsWith('/feed');
  }

  async onSearch() {
    clearTimeout(this.debounceTimer);

    const term = this.query.trim();

    if (!term) {
      this.results = [];
      this.userResults = [];
      this.postResults = [];
      this.reelResults = [];
      this.isSearching = false;
      return;
    }

    this.isSearching = true;
    this.showDropdown = true;

    this.debounceTimer = setTimeout(async () => {
      try {
        const all = await this.search.searchAll(term);

        this.results = all;

        const termLower = term.toLowerCase();

this.userResults = all.filter((r: any) =>
  r.type === 'user' &&
  r.name?.toLowerCase().startsWith(termLower)
);

this.postResults = all.filter((r: any) =>
  r.type === 'post' &&
  r.name?.toLowerCase().startsWith(termLower)
);

this.reelResults = all.filter((r: any) =>
  r.type === 'reel' &&
  (r.name || '').toLowerCase().startsWith(termLower)
);

      } catch (e) {
        console.error('Error en búsqueda:', e);

        this.results = [];
        this.userResults = [];
        this.postResults = [];
        this.reelResults = [];

      } finally {
        this.isSearching = false;
      }
    }, 300);
  }

  onBlur() {
    setTimeout(() => {
      this.showDropdown = false;
    }, 150);
  }

  go(path: string) {
    this.router.navigateByUrl(path); // 🔥 mejor para queryParams

    this.results = [];
    this.userResults = [];
    this.postResults = [];
    this.reelResults = [];

    this.query = '';
    this.showDropdown = false;
  }

  toggleMenu() {
    this.isMenuOpen = !this.isMenuOpen;
  }

  logout() {
    this.auth.logout().then(() => this.router.navigate(['/login']));
  }

  openTeams() {
    window.open('https://teams.microsoft.com', '_blank');
  }

  openMoodle() {
    window.open('https://aulasvirtuales.unicamacho.edu.co/login/', '_blank');
  }

loadNotifications() {

  this.auth.user$.subscribe(user => {

    if (!user) return;

    const ref = collection(
      this.firestore,
      `users/${user.uid}/notifications`
    );

    collectionData(ref, { idField: 'id' })
      .subscribe({
        next: (data: any[]) => {

          console.log('NOTIFS:', data);

          this.notifications = data;

        },

        error: err => {
          console.error('ERROR NOTIFS:', err);
        }
      });

  });

}
async openNotification(notification: any) {

  this.showNotifications = false;

  // 🔥 marcar leída
  if (!notification.read) {

    const ref = doc(
      this.firestore,
      `users/${
        (await firstValueFrom(this.auth.user$))?.uid
      }/notifications/${notification.id}`
    );

    await updateDoc(ref, {
      read: true
    });

  }

  // 🔥 abrir post
  if (notification.postId) {

    this.router.navigate([
      '/post',
      notification.postId
    ]);

  }

}

get unreadNotificationsCount(): number {
  return this.notifications?.filter(n => !n.read).length || 0;
}
}