import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { FeedComponent } from './components/feed/feed.component';
import { LoginComponent } from './pages/login/login.component';
import { AuthGuard } from './guards/auth.guard';
import { ReelsComponent } from './pages/reels/reels.component';
import { FriendsComponent } from './pages/friends/friends.component';
import { ProfileComponent } from './pages/profile/profile.component';
import { SavedComponent } from './pages/saved/saved.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'login', component: LoginComponent },
  {
    path: 'complete-profile',
    loadComponent: () =>
      import('./pages/profile-completion/profile-completion.component')
        .then(m => m.ProfileCompletionComponent)
  },
  { path: 'feed', component: FeedComponent, canActivate: [AuthGuard] },
  { path: 'reels', component: ReelsComponent, canActivate: [AuthGuard] },
  { path: 'friends', component: FriendsComponent, canActivate: [AuthGuard] },
  { path: 'profile', component: ProfileComponent, canActivate: [AuthGuard] },
  { path: 'saved', component: SavedComponent, canActivate: [AuthGuard] },
  {
    path: 'chat',
    loadComponent: () =>
      import('./pages/chat/chat.component')
        .then(m => m.ChatComponent),
    canActivate: [AuthGuard]
  },

  // ✅ Ruta nueva para ver el perfil de cualquier usuario
  {
    path: 'user/:id',
    loadComponent: () =>
      import('./pages/user-profile/user-profile.component')
        .then(m => m.UserProfileComponent),
    canActivate: [AuthGuard]
  },

  {
  path: 'post/:id',
  loadComponent: () =>
    import('./pages/post-detail/post-detail.component') 
      .then(m => m.PostDetailComponent)
},

  { path: '**', redirectTo: '' }
];