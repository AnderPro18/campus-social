import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  getDocs,
  updateDoc
} from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root'
})
export class SearchService {

  private firestore = inject(Firestore);

  async searchAll(term: string): Promise<any[]> {
    const text = term.toLowerCase();

    const [users, posts, reels] = await Promise.all([
      this.searchUsers(text),
      this.searchPosts(text),
      this.searchReels(text)
    ]);

    // ✅ FIX: ahora sí existe reels
    return [...users, ...posts, ...reels];
  }

  // 🔍 USUARIOS
  async searchUsers(term: string): Promise<any[]> {
    try {
      const snap = await getDocs(collection(this.firestore, 'users'));

      return snap.docs
        .map(doc => {
          const data = doc.data() as any;
          return {
            type: 'user',
            id: doc.id,
            name: data.displayName,
            photoURL: data.photoURL || data.avatar,
            route: `/user/${doc.id}`
          };
        })
        .filter(u => u.name?.toLowerCase().includes(term))
        .slice(0, 5);

    } catch (e) {
      console.error(e);
      return [];
    }
  }

  // 📝 POSTS
  async searchPosts(term: string): Promise<any[]> {
    try {
      const snap = await getDocs(collection(this.firestore, 'posts'));

      return snap.docs
        .map(doc => {
          const data = doc.data() as any;
          return {
            type: 'post',
            id: doc.id,
            name: data.content,
            route: `/post/${doc.id}`
          };
        })
        .filter(p => p.name?.toLowerCase().includes(term))
        .slice(0, 5);

    } catch (e) {
      console.error(e);
      return [];
    }
  }

  // 🎥 REELS
  async searchReels(term: string): Promise<any[]> {
    try {
      const snap = await getDocs(collection(this.firestore, 'reels'));

      return snap.docs
        .map(doc => {
          const data = doc.data() as any;

          return {
            type: 'reel',
            id: doc.id,
            name: data.description || 'Reel',
            route: `/reels?reelId=${doc.id}` // 🔥 IMPORTANTE
          };
        })
        .filter(r => r.name?.toLowerCase().includes(term))
        .slice(0, 5);

    } catch (e) {
      console.error(e);
      return [];
    }
  }

  // 🔧 FIX DATOS
  async fixUsers() {
    const snap = await getDocs(collection(this.firestore, 'users'));

    for (const d of snap.docs) {
      const data = d.data() as any;

      if (data.displayName) {
        await updateDoc(d.ref, {
          displayNameLower: data.displayName.toLowerCase()
        });
      }
    }
  }

  async fixPosts() {
    const snap = await getDocs(collection(this.firestore, 'posts'));

    for (const d of snap.docs) {
      const data = d.data() as any;

      if (data.content) {
        await updateDoc(d.ref, {
          contentLower: data.content.toLowerCase()
        });
      }
    }
  }
}