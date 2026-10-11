// src/app/services/user.service.ts
import { inject, Injectable } from '@angular/core';
import { Firestore, doc, setDoc, deleteDoc, getDoc } from '@angular/fire/firestore';
import { serverTimestamp, updateDoc, increment } from '@firebase/firestore';

@Injectable({ providedIn: 'root' })
export class UserService {
  private firestore = inject(Firestore);

  async isFollowing(userId: string, targetId: string): Promise<boolean> {
    if (!userId || !targetId || userId === targetId) return false;

    const ref = doc(this.firestore, `follows/${userId}/following/${targetId}`);
    const snap = await getDoc(ref);
    return snap.exists();
  }

  async getFollowCounts(userId: string): Promise<{ followersCount: number; followingCount: number }> {
    const snap = await getDoc(doc(this.firestore, `users/${userId}`));
    const data = snap.data() ?? {};

    return {
      followersCount: Number(data['followersCount'] ?? 0),
      followingCount: Number(data['followingCount'] ?? 0)
    };
  }

  async follow(userId: string, targetId: string) {
    if (!userId || !targetId || userId === targetId) return;

    const followingRef = doc(this.firestore, `follows/${userId}/following/${targetId}`);
    await setDoc(followingRef, { createdAt: serverTimestamp() });
    await updateDoc(doc(this.firestore, `users/${userId}`), { followingCount: increment(1) });
    await updateDoc(doc(this.firestore, `users/${targetId}`), { followersCount: increment(1) });
  }

  async unfollow(userId: string, targetId: string) {
    if (!userId || !targetId || userId === targetId) return;

    await deleteDoc(doc(this.firestore, `follows/${userId}/following/${targetId}`));
    await updateDoc(doc(this.firestore, `users/${userId}`), { followingCount: increment(-1) });
    await updateDoc(doc(this.firestore, `users/${targetId}`), { followersCount: increment(-1) });
  }
}
