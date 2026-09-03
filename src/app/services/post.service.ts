import { inject, Injectable } from '@angular/core';
import {
  Firestore,
  doc,
  collection,
  setDoc,
  addDoc,
  deleteDoc,
  serverTimestamp,
  collectionData,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  updateDoc,
  increment
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Reel } from '../models/reel.model';
import { Post } from '../models/post.model';
import { CommentModel } from '../models/comment.model';
import { AppUser } from '../models/user.model';
import { UploadService } from './upload.service';    // ← NUEVO

export type ReactionType = 'like' | 'love' | 'haha' | 'sad' | 'angry' | 'wow';

@Injectable({ providedIn: 'root' })
export class PostService {

  private fs            = inject(Firestore);
  private uploadService = inject(UploadService);    // ← NUEVO (ya no inyecta HttpClient)

  /* ===========================
     SUBIR REEL  ← ahora va directo a Firebase Storage
  =========================== */
  uploadVideo(file: File, data: any): Observable<any> {
    return this.uploadService.uploadVideo(file, {
      uid:         data.uid,
      userName:    data.userName,
      description: data.description || '',
      avatarUrl:   data.avatarUrl   || '',
    });
  }

  /* ===========================
     OBTENER TODOS LOS REELS
  =========================== */
  getReelsFirestore(): Observable<Reel[]> {
    return collectionData(
      collection(this.fs, 'reels'),
      { idField: 'id' }
    ) as Observable<Reel[]>;
  }

  /* ===========================
     OBTENER REELS POR USUARIO
  =========================== */
  getUserReels(uid: string): Observable<Reel[]> {
    const q = query(
      collection(this.fs, 'reels'),
      where('uid', '==', uid),
      orderBy('createdAt', 'desc')
    );
    return collectionData(q, { idField: 'id' }) as Observable<Reel[]>;
  }

  /* ===========================
     ELIMINAR REEL
  =========================== */
  deleteReel(reelId: string) {
    return deleteDoc(doc(this.fs, `reels/${reelId}`));
  }

  /* ===========================
     REACCIONES EN REELS
  =========================== */
  async applyReactionToReel(
    reelId: string,
    uid: string,
    type: ReactionType
  ): Promise<{ total: number; userReaction: ReactionType | null }> {

    const reactionRef = doc(this.fs, `reels/${reelId}/reactions/${uid}`);
    const reelRef     = doc(this.fs, `reels/${reelId}`);

    const snap = await getDoc(reactionRef);
    let userReaction: ReactionType | null = null;

    if (snap.exists()) {
      const prevType = snap.data()?.['type'];
      if (prevType === type) {
        await deleteDoc(reactionRef);
      } else {
        await setDoc(reactionRef, { uid, type, updatedAt: serverTimestamp() });
        userReaction = type;
      }
    } else {
      await setDoc(reactionRef, { uid, type, createdAt: serverTimestamp() });
      userReaction = type;
    }

    const all = await getDocs(collection(this.fs, `reels/${reelId}/reactions`));
    await updateDoc(reelRef, { likes: all.size });

    return { total: all.size, userReaction };
  }

  getUserReaction(reelId: string, uid: string) {
    return getDoc(doc(this.fs, `reels/${reelId}/reactions/${uid}`));
  }

  /* ===========================
     COMENTARIOS EN REELS
  =========================== */
  async addCommentReel(reelId: string, comment: CommentModel) {
    const commentsRef = collection(this.fs, `reels/${reelId}/comments`);
    const reelRef     = doc(this.fs, `reels/${reelId}`);

    await setDoc(doc(commentsRef), { ...comment, createdAt: serverTimestamp() });
    await updateDoc(reelRef, { commentsCount: increment(1) });
  }

  /* ===========================
     GUARDAR REEL
  =========================== */
  saveReelToUser(uid: string, reel: Reel) {
    return setDoc(
      doc(this.fs, `users/${uid}/savedPosts/${reel.id!}`),
      {
        type:      'reel',
        reelId:    reel.id!,
        videoUrl:  reel.videoUrl,
        content:   reel.description || '',
        userName:  reel.userName,
        userAvatar: reel.avatarUrl || '',
        createdAt: serverTimestamp()
      }
    );
  }

  /* ===========================
     REPOST DE REEL AL FEED
  =========================== */
  async repostReelToFeed(
    reel: Reel,
    user: AppUser,
    extra?: { description?: string; tags?: string[] }
  ) {
    const postData = {
      type: 'repost',
      originalPostId:      reel.id!,
      originalType:        'reel',
      originalAuthorId:    reel.uid,
      originalAuthorName:  reel.userName,
      originalAuthorAvatar: reel.avatarUrl || '',
      originalCreatedAt:   reel.createdAt,
      content:    extra?.description || reel.description || '',
      tags:       extra?.tags || [],
      videoUrl:   reel.videoUrl || '',
      imageUrl:   '',
      userId:            user.uid,
      userName:          user.displayName || 'Usuario',
      userAvatar:        user.photoURL || '',
      repostedById:      user.uid,
      repostedByName:    user.displayName || 'Usuario',
      createdAt:         serverTimestamp(),
      repostDate:        serverTimestamp(),
      likesCount:        0,
      commentsCount:     0,
      repostsCount:      0
    };

    await setDoc(doc(collection(this.fs, 'posts')), postData);
  }

  /* ===========================
     ⚠️ YA NO SE USA AUTOMÁTICAMENTE
     (evita duplicados en feed)
  =========================== */
  createReelPost(reel: Reel, user: AppUser) {
    const postRef = doc(collection(this.fs, 'posts'));
    return setDoc(postRef, {
      id:           postRef.id,
      type:         'reel',
      reelId:       reel.id!,
      videoUrl:     reel.videoUrl,
      content:      reel.description || '',
      userId:       user.uid,
      userName:     user.displayName,
      userAvatar:   user.photoURL || '',
      createdAt:    serverTimestamp(),
      likesCount:   0,
      commentsCount: 0,
      repostsCount: 0
    });
  }

  /* ===========================
     REACCIONES A COMENTARIOS
  =========================== */
  async reactToComment(
    postId: string,
    commentId: string,
    uid: string,
    type: ReactionType
  ) {
    const reactionRef = doc(
      this.fs,
      `posts/${postId}/comments/${commentId}/reactions/${uid}`
    );
    const snap = await getDoc(reactionRef);

    if (snap.exists() && snap.data()['type'] === type) {
      await deleteDoc(reactionRef);
      return null;
    }

    await setDoc(reactionRef, { type, createdAt: serverTimestamp() });
    return type;
  }

  /* ===========================
     RESPONDER A COMENTARIO
  =========================== */
  async replyToComment(postId: string, commentId: string, reply: any) {
    const repliesRef = collection(
      this.fs,
      `posts/${postId}/comments/${commentId}/replies`
    );
    await setDoc(doc(repliesRef), {
      ...reply,
      createdAt:      serverTimestamp(),
      reactionsCount: 0
    });
    await updateDoc(
      doc(this.fs, `posts/${postId}/comments/${commentId}`),
      { repliesCount: increment(1) }
    );
  }
}