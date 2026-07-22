import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  deleteDoc,
  doc,
  orderBy,
  query,
  where,
  setDoc,
  serverTimestamp
} from '@angular/fire/firestore';

import { Observable } from 'rxjs';
import { Reel } from '../models/reel.model';

@Injectable({
  providedIn: 'root'
})
export class ReelService {

  private fs = inject(Firestore);

  getReels(): Observable<Reel[]> {
    return collectionData(
      collection(this.fs, 'reels'),
      { idField: 'id' }
    ) as Observable<Reel[]>;
  }

  getUserReels(uid: string): Observable<Reel[]> {

    const q = query(
      collection(this.fs, 'reels'),
      where('uid', '==', uid),
      orderBy('createdAt', 'desc')
    );

    return collectionData(
      q,
      { idField: 'id' }
    ) as Observable<Reel[]>;
  }

  deleteReel(reelId: string) {
    return deleteDoc(doc(this.fs, `reels/${reelId}`));
  }

  saveReelToUser(uid: string, reel: Reel) {

    return setDoc(
      doc(this.fs, `users/${uid}/savedPosts/${reel.id}`),
      {
        type: 'reel',
        reelId: reel.id,
        videoUrl: reel.videoUrl,
        content: reel.description || '',
        userName: reel.userName,
        userAvatar: reel.avatarUrl || '',
        createdAt: serverTimestamp()
      }
    );
  }
}