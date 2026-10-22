import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { PushService } from '../../services/push.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {

  error = '';
  email = '';
  password = '';
  isSubmitting = false;

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
    this.isSubmitting = true;
    this.error = '';

    try {
      const credential = await this.auth.loginWithMicrosoftPopup();

      if (!credential) return;

      await this.router.navigate(['/']);
    } catch (err: unknown) {
      console.error(err);
      this.error = err instanceof Error ? err.message : 'Error al iniciar con Microsoft';
    } finally {
      this.isSubmitting = false;
    }
  }

  async emailPasswordLogin() {
    this.isSubmitting = true;
    this.error = '';

    try {
      await this.auth.loginWithEmailAndPassword(this.email.trim(), this.password);
      await this.router.navigate(['/feed']);
    } catch (err: unknown) {
      console.error(err);
      this.error = this.auth.getEmailAuthErrorMessage(err);
    } finally {
      this.isSubmitting = false;
    }
  }

  async microsoftRedirect() {
    try {
      await this.auth.loginWithMicrosoftRedirect();
    } catch (err: unknown) {
      console.error(err);
      this.error = err instanceof Error ? err.message : 'Error en redirect';
    }
  }
}