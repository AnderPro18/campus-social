import { Injectable, inject } from '@angular/core';

import {
  Firestore,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc
} from '@angular/fire/firestore';

export type ReactionType =
  | 'like'
  | 'love'
  | 'haha'
  | 'sad'
  | 'angry'
  | 'wow';

@Injectable({
  providedIn: 'root'
})
export class ReactionService {

  private fs = inject(Firestore);

  async applyReactionToReel(
    reelId: string,
    uid: string,
    type: ReactionType
  ): Promise<{
    total: number;
    userReaction: ReactionType | null;
  }> {

    const reactionRef = doc(
      this.fs,
      `reels/${reelId}/reactions/${uid}`
    );

    const reelRef = doc(
      this.fs,
      `reels/${reelId}`
    );

    const snap = await getDoc(reactionRef);

    let userReaction: ReactionType | null = null;

    if (snap.exists()) {

      const prevType = snap.data()?.['type'];

      if (prevType === type) {

        await deleteDoc(reactionRef);

      } else {

        await setDoc(reactionRef, {
          uid,
          type,
          updatedAt: serverTimestamp()
        });

        userReaction = type;
      }

    } else {

      await setDoc(reactionRef, {
        uid,
        type,
        createdAt: serverTimestamp()
      });

      userReaction = type;
    }

    const all = await getDocs(
      collection(this.fs, `reels/${reelId}/reactions`)
    );

    await updateDoc(reelRef, {
      likes: all.size
    });

    return {
      total: all.size,
      userReaction
    };
  }

  getUserReaction(
    reelId: string,
    uid: string
  ) {

    return getDoc(
      doc(
        this.fs,
        `reels/${reelId}/reactions/${uid}`
      )
    );
  }
}