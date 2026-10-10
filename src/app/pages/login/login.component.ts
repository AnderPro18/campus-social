import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { PushService } from '../../services/push.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {

  error = '';

  private pushService = inject(PushService);

    constructor(
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    if (this.route.snapshot.queryParamMap.get('blocked')) {
      this.error = 'Tu cuenta fue bloqueada por un moderador. Si crees que es un error, comunícate con la administración.';
    }
    this.pushService.requestPermissionAndSaveToken();
  }

  async microsoftPopup() {
    try {
      const credential = await this.auth.loginWithMicrosoftPopup();

      if (!credential) return;

      // Login exitoso
      await this.router.navigate(['/']);

      return;

    } catch (err: any) {
      console.error(err);
      this.error = err?.message || 'Error al iniciar con Microsoft';
      return;
    }
  }

  async microsoftRedirect() {
    try {
      await this.auth.loginWithMicrosoftRedirect();
    } catch (err: any) {
      console.error(err);
      this.error = err?.message || 'Error en redirect';
    }
  }
}