import { Injectable, inject } from '@angular/core';

import {
  Firestore,
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc
} from '@angular/fire/firestore';

import { CommentModel } from '../models/comment.model';

@Injectable({
  providedIn: 'root'
})
export class CommentService {

  private fs = inject(Firestore);

  async addCommentReel(
    reelId: string,
    comment: CommentModel
  ) {

    const commentsRef = collection(
      this.fs,
      `reels/${reelId}/comments`
    );

    const reelRef = doc(
      this.fs,
      `reels/${reelId}`
    );

    await setDoc(
      doc(commentsRef),
      {
        ...comment,
        createdAt: serverTimestamp()
      }
    );

    await updateDoc(reelRef, {
      commentsCount: increment(1)
    });
  }

  async reactToComment(
    postId: string,
    commentId: string,
    uid: string,
    type: string
  ) {

    const reactionRef = doc(
      this.fs,
      `posts/${postId}/comments/${commentId}/reactions/${uid}`
    );

    const snap = await getDoc(reactionRef);

    if (
      snap.exists() &&
      snap.data()['type'] === type
    ) {

      await deleteDoc(reactionRef);
      return null;
    }

    await setDoc(reactionRef, {
      type,
      createdAt: serverTimestamp()
    });

    return type;
  }

  async replyToComment(
    postId: string,
    commentId: string,
    reply: any
  ) {

    const repliesRef = collection(
      this.fs,
      `posts/${postId}/comments/${commentId}/replies`
    );

    await setDoc(
      doc(repliesRef),
      {
        ...reply,
        createdAt: serverTimestamp(),
        reactionsCount: 0
      }
    );

    await updateDoc(
      doc(
        this.fs,
        `posts/${postId}/comments/${commentId}`
      ),
      {
        repliesCount: increment(1)
      }
    );
  }
}