import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map, switchMap, filter, take } from 'rxjs/operators';
import { of } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  constructor(private auth: AuthService, private router: Router) {}

  canActivate() {
    return this.auth.user$.pipe(
      // ⚠️ FIX: user$ emite null primero (estado inicial de Firebase Auth)
      // Hay que esperar a que emita un valor definido (null = no logueado, objeto = logueado)
      // "undefined" es el estado "aún cargando", null es "no hay sesión"
      filter(user => user !== undefined),
      take(1),  // solo evaluar una vez por navegación
      switchMap(user => {
        if (!user) {
          this.router.navigate(['/login']);
          return of(false);
        }

    return this.auth.checkAccess(user.uid).then(async access => {
          if (access === 'blocked') {
            // Cuenta bloqueada por un moderador: se cierra la sesión y se avisa en el login
            await this.auth.logout();
            this.router.navigate(['/login'], { queryParams: { blocked: '1' } });
            return false;
          }
          if (access === 'incomplete') {
            this.router.navigate(['/complete-profile']);
            return false;
          }
          return true;
        });
      })
    );
  }
}