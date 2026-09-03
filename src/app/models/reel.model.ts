import { Timestamp } from '@angular/fire/firestore';

export interface Reel {

  id?: string;

  uid: string;

  userName: string;

  avatarUrl?: string;

  description?: string;

  videoUrl: string;

  likes?: number;

  commentsCount?: number;

  repostsCount?: number;

  createdAt: Timestamp;

  /* =========================
     SOLO UI
  ========================= */

  showComments?: boolean;

  newComment?: string;

  userReaction?: string | null;
}