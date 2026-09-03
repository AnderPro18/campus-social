import { Component, inject } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { RouterOutlet, RouterModule } from '@angular/router';
import { NavbarComponent } from './components/navbar/navbar.component';
import { AuthService } from './services/auth.service';
import { combineLatest } from 'rxjs';
import { CommonModule } from '@angular/common';
import { ProfileStateService } from './services/profile-state.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterModule, NavbarComponent, CommonModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {

  showNavbar = false;

  private routerService = inject(Router);
  private auth = inject(AuthService);
  private profileState = inject(ProfileStateService);

  constructor() {

    this.auth.user$.subscribe(async user => {
      if (!user) {
        this.profileState.setProfileComplete(false);
        return;
      }

      const complete = await this.auth.isProfileComplete(user.uid);
      this.profileState.setProfileComplete(complete);
    });

    combineLatest([
      this.auth.user$,
      this.profileState.profileComplete$,
      this.routerService.events.pipe(filter(e => e instanceof NavigationEnd))
    ]).subscribe(([user, profileComplete, event]) => {

      const url = (event as NavigationEnd).urlAfterRedirects;

      const hideRoutes = [
        '/',
        '/login',
        '/complete-profile'
      ];

      // 👇 SOLO comparar rutas EXACTAS
      if (hideRoutes.includes(url)) {
        this.showNavbar = false;
        return;
      }

      this.showNavbar = !!user && profileComplete;
    });
  }
}