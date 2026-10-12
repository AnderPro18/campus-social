import { Injectable, inject } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { Auth } from '@angular/fire/auth';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { AuthService } from '../services/auth.service';
import { filter, switchMap, take } from 'rxjs/operators';
import { of } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AdminGuard implements CanActivate {
  private authService = inject(AuthService);
  private firestore = inject(Firestore);
  private router = inject(Router);

  canActivate() {
    return this.authService.user$.pipe(
      filter(user => user !== undefined),
      take(1),
      switchMap(async user => {
        if (!user) {
          this.router.navigate(['/login']);
          return false;
        }

        const userRef = doc(this.firestore, `users/${user.uid}`);
        const snap = await getDoc(userRef);
        const role = snap.data()?.['role'];

        if (role === 'admin' || role === 'moderator') {
          return true;
        }

        this.router.navigate(['/home']);
        return false;
      })
    );
  }
}
