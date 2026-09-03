import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { Firestore, doc, setDoc } from '@angular/fire/firestore';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ProfileStateService } from '../../services/profile-state.service';

@Component({
  selector: 'app-profile-completion',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile-completion.component.html',
  styleUrls: ['./profile-completion.component.scss']
})
export class ProfileCompletionComponent {

  auth = inject(AuthService);
  router = inject(Router);
  fs = inject(Firestore);

  // ✅ Aquí inyectamos el estado del perfil
  profileState = inject(ProfileStateService);

  form: any = {
    carrera: '',
    area: '',
    fechaNacimiento: '',
    ciudad: '',
    departamento: '',
    descripcion: ''
  };

  isStudent = false;

  async ngOnInit() {
    const user = await firstValueFrom(this.auth.user$);
    if (!user) return;

    const email = user.email || '';
    this.isStudent = email.endsWith('@estudiante.uniajc.edu.co');
  }

  async submit() {
    const user = await firstValueFrom(this.auth.user$);
    if (!user) return;
    const uid = user.uid;

    const payload: any = {
      displayName: user.displayName,
      email: user.email,
      fechaNacimiento: this.form.fechaNacimiento,
      ciudad: this.form.ciudad,
      departamento: this.form.departamento,
      descripcion: this.form.descripcion,
      updatedAt: new Date()
    };

    if (this.isStudent) {
      payload.carrera = this.form.carrera;
    } else {
      payload.area = this.form.area;
    }

    await setDoc(doc(this.fs, `users/${uid}`), payload, { merge: true });

    // 🔥 AVISAR QUE EL PERFIL YA ESTÁ COMPLETO
    this.profileState.setProfileComplete(true);

    // 🔥 REDIRIGIR AL HOME
this.profileState.setProfileComplete(true);

setTimeout(() => {
  this.router.navigate(['/feed']);
}, 50);
  }
}