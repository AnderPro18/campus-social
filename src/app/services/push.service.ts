import { Injectable, inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  Firestore,
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
} from '@angular/fire/firestore';
import { Messaging, getToken, onMessage } from '@angular/fire/messaging';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PushService {
  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private messaging = inject(Messaging);

  /**
   * Pide permiso al usuario y, si lo concede, guarda el token FCM en su
   * documento de Firestore (users/{uid}.fcmTokens, un array — un usuario
   * puede tener varios dispositivos/navegadores).
   * Llamar esto una vez después del login (ej. desde el AuthGuard o el
   * componente de Home al cargar).
   */
  async requestPermissionAndSaveToken(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) return;

    if (!('Notification' in window)) {
      console.warn('Este navegador no soporta notificaciones push.');
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    try {
      const token = await getToken(this.messaging, {
        vapidKey: environment.firebase.vapidKey,
        serviceWorkerRegistration: await navigator.serviceWorker.getRegistration(
          '/firebase-messaging-sw.js'
        ),
      });

      if (token) {
        const userRef = doc(this.firestore, `users/${user.uid}`);
        await updateDoc(userRef, { fcmTokens: arrayUnion(token) });
      }
    } catch (err) {
      console.error('Error obteniendo el token de FCM:', err);
    }
  }

  /** Llamar al cerrar sesión, para dejar de recibir push en este dispositivo. */
  async removeCurrentToken(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) return;

    try {
      const token = await getToken(this.messaging, {
        vapidKey: environment.firebase.vapidKey,
      });
      if (token) {
        const userRef = doc(this.firestore, `users/${user.uid}`);
        await updateDoc(userRef, { fcmTokens: arrayRemove(token) });
      }
    } catch {
      // Si ya no hay token válido, no hay nada que quitar.
    }
  }

  /** Notificaciones mientras la app está ABIERTA en primer plano. */
  listenForegroundMessages(onMessageCallback: (payload: any) => void): void {
    onMessage(this.messaging, (payload) => onMessageCallback(payload));
  }

  /**
   * Llama al endpoint serverless gratuito (Vercel/Netlify) que envía el
   * push real. Llamar esto justo después de crear cualquier notificación
   * in-app (donde hoy escribes en users/{uid}/notifications/{id}).
   * No lanza si falla — un push perdido no debe romper el flujo principal.
   */
  async triggerPush(uid: string, notificationId: string): Promise<void> {
    try {
      await fetch(environment.pushEndpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${environment.pushTriggerSecret}`,
        },
        body: JSON.stringify({ uid, notificationId }),
      });
    } catch (err) {
      console.warn('No se pudo disparar el push (no crítico):', err);
    }
  }
}