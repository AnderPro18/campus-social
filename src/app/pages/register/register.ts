
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule, NgForm } from '@angular/forms';
import { Router } from '@angular/router';
import { AccountCreatedProfileSetupError, AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './register.html',
  styleUrl: './register.scss',
})
export class Register {
  private auth = inject(AuthService);
  private router = inject(Router);

  name = '';
  email = '';
  password = '';
  confirmPassword = '';
  error = '';
  successMessage = '';
  accountCreated = false;
  accountEmail = '';
  isSubmitting = false;

  async createAccount(form: NgForm) {
    this.error = '';
    this.successMessage = '';

    if (!this.name.trim()) {
      this.error = 'Escribe tu nombre completo.';
      return;
    }

    const normalizedEmail = this.email.trim().toLowerCase();
    if (!this.isValidEmail(normalizedEmail)) {
      this.error = 'Escribe un correo electrónico válido.';
      return;
    }

    const emailDomain = normalizedEmail.slice(normalizedEmail.lastIndexOf('@') + 1);
    if (!['estudiante.uniajc.edu.co', 'profesores.uniajc.edu.co'].includes(emailDomain)) {
      this.error = 'Solo se permiten correos @estudiante.uniajc.edu.co o @profesores.uniajc.edu.co.';
      return;
    }

    if (this.password.length < 6) {
      this.error = 'La contraseña debe tener al menos 6 caracteres.';
      return;
    }

    if (this.password !== this.confirmPassword) {
      this.error = 'Las contraseñas no coinciden.';
      return;
    }

    if (form.invalid) {
      form.control.markAllAsTouched();
      this.error = 'Revisa el formulario: usa un correo válido y una contraseña de al menos 6 caracteres; completa todos los campos.';
      return;
    }

    this.isSubmitting = true;
    try {
      const credential = await this.auth.registerWithEmailAndPassword(
        this.name.trim(),
        normalizedEmail,
        this.password
      );

      this.accountCreated = true;
      this.accountEmail = credential.user.email ?? this.email.trim();
      this.successMessage = `La cuenta ${this.accountEmail} se creó en Firebase Authentication y su perfil inicial se guardó en Firestore.`;
    } catch (err: unknown) {
      if (err instanceof AccountCreatedProfileSetupError) {
        console.error(err.originalError);
        this.accountCreated = true;
        this.accountEmail = this.email.trim();
        const setupError = this.auth.getEmailAuthErrorMessage(err.originalError);
        this.successMessage = `La cuenta ${this.accountEmail} sí se creó en Firebase Authentication, pero su perfil no se pudo guardar por completo. ${setupError}`;
      } else {
        console.error(err);
        this.error = this.auth.getEmailAuthErrorMessage(err);
      }
    } finally {
      this.isSubmitting = false;
    }
  }

  async continueToProfile() {
    await this.router.navigate(['/complete-profile']);
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}
