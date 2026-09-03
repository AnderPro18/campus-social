import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import {
  Firestore,
  doc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy,
  updateDoc,
  increment,
  deleteDoc,
  setDoc
} from '@angular/fire/firestore';
import { AuthService } from '../../services/auth.service';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-post-detail',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './post-detail.component.html',
  styleUrls: ['./post-detail.component.scss']
})
export class PostDetailComponent implements OnInit {

  private route = inject(ActivatedRoute);
  private firestore = inject(Firestore);
  auth = inject(AuthService);

  post: any = null;
  comments: any[] = [];
  loading = true;

  newComment = '';

  // 🔥 REACCIONES
  likesCount = 0;
  userReaction: string | null = null;

  reactionList = [
    { type: 'like', emoji: '👍' },
    { type: 'love', emoji: '❤️' },
    { type: 'haha', emoji: '😂' },
    { type: 'wow', emoji: '😮' },
    { type: 'sad', emoji: '😢' },
    { type: 'angry', emoji: '😡' },
  ];

  reactionMenuVisible = false;
  reactionMenuPos = { x: 0, y: 0 };
  holdTimer: any;

  async ngOnInit() {
    const postId = this.route.snapshot.paramMap.get('id');
    if (!postId) return;

    await this.loadPost(postId);
    this.listenReactions(postId);
    this.listenComments(postId);
  }

  async loadPost(postId: string) {
    const snap = await getDoc(doc(this.firestore, `posts/${postId}`));

    if (snap.exists()) {
      const data = snap.data() as any;

      this.post = {
        id: snap.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() ?? new Date()
      };
    }

    this.loading = false;
  }

  // ================= COMMENTS =================
  listenComments(postId: string) {
    const q = query(
      collection(this.firestore, `posts/${postId}/comments`),
      orderBy('createdAt', 'desc')
    );

    onSnapshot(q, (snap) => {
      this.comments = snap.docs.map(d => {
        const data = d.data() as any;
        return {
          id: d.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() ?? new Date()
        };
      });
    });
  }

  async addComment() {
    if (!this.newComment.trim()) return;

    const user = await firstValueFrom(this.auth.user$);
    if (!user) return;

    await addDoc(
      collection(this.firestore, `posts/${this.post.id}/comments`),
      {
        text: this.newComment,
        userId: user.uid,
        userName: user.displayName,
        userAvatar: user.photoURL,
        createdAt: serverTimestamp()
      }
    );

    await updateDoc(
      doc(this.firestore, `posts/${this.post.id}`),
      { commentsCount: increment(1) }
    );

    this.newComment = '';
  }

  async deleteComment(comment: any) {
    const user = await firstValueFrom(this.auth.user$);
    if (!user || user.uid !== comment.userId) return;

    const ok = confirm('¿Eliminar comentario?');
    if (!ok) return;

    await deleteDoc(
      doc(this.firestore, `posts/${this.post.id}/comments/${comment.id}`)
    );

    await updateDoc(
      doc(this.firestore, `posts/${this.post.id}`),
      { commentsCount: increment(-1) }
    );
  }

  // ================= REACTIONS =================
  listenReactions(postId: string) {
    const q = collection(this.firestore, `posts/${postId}/reactions`);

    onSnapshot(q, async (snap) => {
      this.likesCount = snap.size;

      const user = await firstValueFrom(this.auth.user$);
      if (!user) return;

      this.userReaction = null;

      snap.forEach(doc => {
        if (doc.id === user.uid) {
          this.userReaction = doc.data()['type'];
        }
      });
    });
  }

  async react(type: string) {
    const user = await firstValueFrom(this.auth.user$);
    if (!user) return;

    const ref = doc(
      this.firestore,
      `posts/${this.post.id}/reactions/${user.uid}`
    );

    if (this.userReaction === type) {
      await deleteDoc(ref);
      this.userReaction = null;
    } else {
      await setDoc(ref, {
        type: type,
        userId: user.uid,
        createdAt: serverTimestamp()
      });
      this.userReaction = type;
    }

    this.reactionMenuVisible = false;
  }

  // ================= HOLD =================
  startHold(event: MouseEvent) {
    this.holdTimer = setTimeout(() => {
      this.reactionMenuVisible = true;
      this.reactionMenuPos = {
        x: event.clientX,
        y: event.clientY - 60
      };
    }, 400);
  }

  endHold() {
    if (this.holdTimer) {
      clearTimeout(this.holdTimer);
      this.react('like');
    }
  }
}