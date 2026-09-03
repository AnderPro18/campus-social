import { Injectable, inject } from '@angular/core';

import {
  Firestore,
  collection,
  doc,
  serverTimestamp,
  setDoc
} from '@angular/fire/firestore';

import { Reel } from '../models/reel.model';
import { AppUser } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class RepostService {

  private fs = inject(Firestore);

  async repostReelToFeed(
    reel: Reel,
    user: AppUser,
    extra?: {
      description?: string;
      tags?: string[];
    }
  ) {

    const postData = {

      type: 'repost',

      originalPostId: reel.id,
      originalType: 'reel',
      originalAuthorId: reel.uid,
      originalAuthorName: reel.userName,
      originalAuthorAvatar: reel.avatarUrl || '',
      originalCreatedAt: reel.createdAt,

      content:
        extra?.description ||
        reel.description || '',

      tags: extra?.tags || [],

      videoUrl: reel.videoUrl || '',

      imageUrl: '',

      userId: user.uid,
      userName: user.displayName || 'Usuario',
      userAvatar: user.photoURL || '',

      repostedById: user.uid,
      repostedByName: user.displayName || 'Usuario',

      createdAt: serverTimestamp(),
      repostDate: serverTimestamp(),

      likesCount: 0,
      commentsCount: 0,
      repostsCount: 0
    };

    await setDoc(
      doc(collection(this.fs, 'posts')),
      postData
    );
  }
}