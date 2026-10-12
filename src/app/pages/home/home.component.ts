import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { PushService } from '../../services/push.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {
  private authService = inject(AuthService);
  private pushService = inject(PushService);

  user$ = this.authService.user$;

  ngOnInit(): void {
    // Pide permiso de notificaciones push la primera vez que el usuario
    // llega a Home ya logueado. El navegador solo pregunta una vez —
    // si el usuario lo rechaza, requestPermissionAndSaveToken() simplemente
    // no hace nada en los siguientes intentos hasta que lo cambie manualmente
    // desde la configuración del navegador.
    this.pushService.requestPermissionAndSaveToken();
  }
}