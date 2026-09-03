// src/app/components/postcard/postcard.component.ts
import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, doc, deleteDoc, setDoc } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';

@Component({
  selector: 'app-post-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './postcard.component.html',
  styleUrls: ['./postcard.component.scss'],
})
export class PostCardComponent {

  @Input() post: any;

  private firestore = inject(Firestore);
  private auth = inject(Auth);

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
