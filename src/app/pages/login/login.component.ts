import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent {

  error = '';

  constructor(private auth: AuthService, private router: Router) {}

 async microsoftPopup() {
  try {
    const credential = await this.auth.loginWithMicrosoftPopup();
    if (!credential) return;

    // SIEMPRE enviar al HOME
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
