// src/app/services/user.service.ts
import { inject, Injectable } from '@angular/core';
import { Firestore, doc, setDoc, deleteDoc, collection, getDoc } from '@angular/fire/firestore';
import { serverTimestamp, updateDoc, increment } from '@firebase/firestore';

@Injectable({providedIn: 'root'})
export class UserService {
  private firestore = inject(Firestore);

  async follow(userId: string, targetId: string) {
    const followingRef = doc(this.firestore, `follows/${userId}/following/${targetId}`);
    await setDoc(followingRef, { createdAt: serverTimestamp() });
    // increment counters on user docs
    await updateDoc(doc(this.firestore, `users/${userId}`), { followingCount: increment(1) });
    await updateDoc(doc(this.firestore, `users/${targetId}`), { followersCount: increment(1) });
  }

  async unfollow(userId:string, targetId:string) {
    await deleteDoc(doc(this.firestore, `follows/${userId}/following/${targetId}`));
    await updateDoc(doc(this.firestore, `users/${userId}`), { followingCount: increment(-1) });
    await updateDoc(doc(this.firestore, `users/${targetId}`), { followersCount: increment(-1) });
  }
}
