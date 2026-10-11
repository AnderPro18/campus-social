// src/app/services/user.service.ts
import { inject, Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  writeBatch
} from '@angular/fire/firestore';
import { increment, serverTimestamp } from '@firebase/firestore';

export interface FollowedUser {
  uid: string;
  displayName: string;
  photoURL: string;
}

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

  async getFollowers(userId: string): Promise<FollowedUser[]> {
    return this.getFollowedUsers(userId, 'followers');
  }

  async getFollowing(userId: string): Promise<FollowedUser[]> {
    return this.getFollowedUsers(userId, 'following');
  }

  async follow(userId: string, targetId: string) {
    if (!userId || !targetId || userId === targetId) return;

    const batch = writeBatch(this.firestore);
    batch.set(doc(this.firestore, `follows/${userId}/following/${targetId}`), {
      createdAt: serverTimestamp()
    });
    batch.set(doc(this.firestore, `follows/${targetId}/followers/${userId}`), {
      createdAt: serverTimestamp()
    });
    batch.update(doc(this.firestore, `users/${userId}`), { followingCount: increment(1) });
    batch.update(doc(this.firestore, `users/${targetId}`), { followersCount: increment(1) });
    await batch.commit();
  }

  async unfollow(userId: string, targetId: string) {
    if (!userId || !targetId || userId === targetId) return;

    const batch = writeBatch(this.firestore);
    batch.delete(doc(this.firestore, `follows/${userId}/following/${targetId}`));
    batch.delete(doc(this.firestore, `follows/${targetId}/followers/${userId}`));
    batch.update(doc(this.firestore, `users/${userId}`), { followingCount: increment(-1) });
    batch.update(doc(this.firestore, `users/${targetId}`), { followersCount: increment(-1) });
    await batch.commit();
  }

  private async getFollowedUsers(
    userId: string,
    relationship: 'followers' | 'following'
  ): Promise<FollowedUser[]> {
    const relationshipsRef = collection(this.firestore, `follows/${userId}/${relationship}`);
    const relationships = await getDocs(relationshipsRef);
    const relatedUserIds = new Set(relationships.docs.map(relationshipDoc => relationshipDoc.id));

    if (relationship === 'followers') {
      const allUsers = await getDocs(collection(this.firestore, 'users'));
      const legacyFollowers = await Promise.all(
        allUsers.docs
          .filter(candidate => candidate.id !== userId && !relatedUserIds.has(candidate.id))
          .map(async candidate => {
            const followSnap = await getDoc(
              doc(this.firestore, `follows/${candidate.id}/following/${userId}`)
            );
            return followSnap.exists() ? candidate.id : null;
          })
      );

      legacyFollowers.forEach(followerId => {
        if (followerId) relatedUserIds.add(followerId);
      });
    }

    const users = await Promise.all(
      [...relatedUserIds].map(async relatedUserId => {
        const userSnap = await getDoc(doc(this.firestore, `users/${relatedUserId}`));
        if (!userSnap.exists()) return null;

        const data = userSnap.data();
        return {
          uid: userSnap.id,
          displayName: String(data['displayName'] || data['name'] || 'Usuario'),
          photoURL: String(data['avatar'] || data['photoURL'] || '')
        };
      })
    );

    return users.filter((user): user is FollowedUser => user !== null);
  }
}
