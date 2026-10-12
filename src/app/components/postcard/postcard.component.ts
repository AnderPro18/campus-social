// src/app/components/postcard/postcard.component.ts
import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, doc, deleteDoc, setDoc } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';

import { ReportButtonComponent } from '../report-button/report-button.component';
import { NotificationService } from '../../services/notification.service';


@Component({
  selector: 'app-post-card',
  standalone: true,
  imports: [CommonModule, ReportButtonComponent],
  templateUrl: './postcard.component.html',
  styleUrls: ['./postcard.component.scss'],
})
export class PostCardComponent {

  @Input() post: any;

  private firestore = inject(Firestore);
  private auth = inject(Auth);
  private notificationService = inject(NotificationService);

  reacting = false;

  async toggleReaction(type: string) {
    if (this.reacting) return;
    this.reacting = true;

    const user = this.auth.currentUser;
    if (!user) {
      console.warn("No hay usuario autenticado");
      this.reacting = false;
      return;
    }

    const reactionRef = doc(
      this.firestore,
      `posts/${this.post.id}/reactions/${user.uid}`
    );

    // Si el usuario ya reaccionó con ese tipo → quitar reacción
    if (this.post.myReaction === type) {
      await deleteDoc(reactionRef);

      this.post.myReaction = null;
      this.post.reactionsCount =
        (this.post.reactionsCount || 1) - 1;

    } else {
      // Registrar reacción nueva
      await setDoc(reactionRef, {
        type,
        createdAt: new Date()
      });

      if (this.post.userId && this.post.myReaction !== type) {
        try {
          await this.notificationService.notifyReaction({
            toUid: this.post.userId,
            fromUid: user.uid,
            fromName: user.displayName || 'Usuario',
            fromAvatar: user.photoURL || '',
            postId: this.post.id
          });
        } catch (error) {
          console.error('No se pudo notificar la reacción:', error);
        }
      }

      // Cambiar en UI
      if (this.post.myReaction) {
        // estaba reaccionando con otro tipo
        this.post.reactionsCount = (this.post.reactionsCount || 1);
      } else {
        this.post.reactionsCount = (this.post.reactionsCount || 0) + 1;
      }

      this.post.myReaction = type;
    }

    this.reacting = false;
  }
}