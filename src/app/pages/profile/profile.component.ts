import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import {
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  addDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  increment,
  setDoc,
  orderBy,
  collectionData,
  Timestamp
} from '@angular/fire/firestore';
import { PostService, ReactionType } from '../../services/post.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent {

  auth = inject(AuthService);
  firestore = inject(Firestore);
  postService = inject(PostService);

  user: any = null;

  // PERFIL
  bio = '';
  careerOrArea = '';
  birthDate = '';
  birthPlace = '';
  avatar = '';
  cover = '';
  editing = false;

  myPosts: any[] = [];
  myReels: any[] = [];
  profileFeed: any[] = [];

  /* =============================
     REACCIONES (UI)
  ============================== */
  reactionList: { type: ReactionType; emoji: string }[] = [
    { type: 'like', emoji: '👍' },
    { type: 'love', emoji: '❤️' },
    { type: 'haha', emoji: '😂' },
    { type: 'sad', emoji: '😢' },
    { type: 'angry', emoji: '😡' }
  ];

  reactionMenuVisible = false;
  reactionMenuItem: any = null;
  reactionMenuPos = { left: 0, top: 0 };
  showReactionsModal = false;
  reactionsList: any[] = [];
  

  private holdTimer: any;
  private longPressTriggered = false;

  constructor() {
    this.auth.user$.subscribe(u => {
      this.user = u;
      if (u) {
        this.loadUserProfile();
        this.loadUserPosts();
        this.loadUserReels();
      } else {
        this.myPosts = [];
        this.myReels = [];
        this.profileFeed = [];
      }
    });
  }

  // =============================
  // FECHAS
  // =============================
  fixDate(raw: any): Date {
    if (!raw) return new Date();
    if (raw instanceof Date) return raw;
    if (raw?.toDate) return raw.toDate();
    return new Date(raw);
  }

  // =============================
  // PERFIL
  // =============================
  async loadUserProfile() {
    if (!this.user) return;
    const ref = doc(this.firestore, `users/${this.user.uid}`);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;

    const data: any = snap.data();
    this.bio = data.bio || '';
    this.careerOrArea = data.careerOrArea || '';
    this.birthDate = data.birthDate || '';
    this.birthPlace = data.birthPlace || '';
    this.avatar = data.avatar || this.user.photoURL || '';
    this.cover = data.cover || '';
  }

  async saveProfile() {
    if (!this.user) return;
    await updateDoc(doc(this.firestore, `users/${this.user.uid}`), {
      bio: this.bio,
      careerOrArea: this.careerOrArea,
      birthDate: this.birthDate,
      birthPlace: this.birthPlace,
      updatedAt: serverTimestamp()
    });
    this.editing = false;
  }

  

  // =============================
  // REELS DEL PERFIL
  // =============================
  async loadUserReels() {
    if (!this.user) return;

    const q = query(
      collection(this.firestore, 'reels'),
      where('uid', '==', this.user.uid),
      orderBy('createdAt', 'desc')
    );

    const snap = await getDocs(q);

    this.myReels = await Promise.all(
      snap.docs.map(async d => {
        const data = d.data() as any;

        const reel: any = {
          id: d.id,
          ...data,
          createdAt: this.fixDate(data.createdAt),
          showComments: false,
          newComment: '',
          likes: data.likes || 0,
          commentsCount: data.commentsCount || 0,
          userReaction: null
        };

        // Reacción del usuario
        try {
          const reactionSnap = await getDoc(
            doc(this.firestore, `reels/${reel.id!}/likes/${this.user.uid}`)
          );
          reel.userReaction = reactionSnap.exists()
            ? reactionSnap.data()?.['type']
            : null;
        } catch {}

        return reel;
      })
    );

    this.buildProfileFeed();
  }

  // =============================
  // REACCIONES REEL (PRESS & HOLD)
  // =============================
  startHold(item: any, e: MouseEvent | TouchEvent) {
    e.preventDefault();
    this.longPressTriggered = false;

    const p = e instanceof TouchEvent ? e.touches[0] : e;

    this.holdTimer = setTimeout(() => {
      this.longPressTriggered = true;
      this.reactionMenuVisible = true;
      this.reactionMenuItem = item;
      this.reactionMenuPos = {
        left: p.clientX - 80,
        top: p.clientY - 60
      };
    }, 400);
  }

  async endHold(item: any) {
    clearTimeout(this.holdTimer);

    if (!this.longPressTriggered) {
      await this.reactToReel(item, 'like');
    }
  }

  cancelHold() {
    clearTimeout(this.holdTimer);
  }

  async selectReaction(item: any, type: ReactionType) {
    await this.reactToReel(item, type);
    this.reactionMenuVisible = false;
    this.reactionMenuItem = null;
  }

  async reactToReel(reel: any, type: ReactionType) {
    if (!this.user) return;

    const result = await this.postService.applyReactionToReel(
      reel.id,
      this.user.uid,
      type
    );

    reel.likes = result.total;
    reel.userReaction = result.userReaction;
  }

  // =============================
  // COMENTARIOS REEL
  // =============================
  async addReelComment(reel: any) {
    if (!this.user || !reel.newComment?.trim()) return;

    await this.postService.addCommentReel(reel.id!, {
      userId: this.user.uid,
      userName: this.user.displayName,
      userAvatar: this.avatar || this.user.photoURL || '',
      content: reel.newComment
    });

    reel.commentsCount = (reel.commentsCount || 0) + 1;
    reel.newComment = '';
  }

  // =============================
  // FEED UNIFICADO
  // =============================
  buildProfileFeed() {
    const posts = this.myPosts.map(p => ({ ...p, type: 'post' }));
    const reels = this.myReels.map(r => ({ ...r, type: 'reel' }));

    this.profileFeed = [...posts, ...reels].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  // =============================
  // POSTS DEL PERFIL
  // =============================
  async loadUserPosts() {
  if (!this.user) return;

  // ✅ Sin orderBy para evitar necesidad de índice compuesto en Firestore
  const q = query(
    collection(this.firestore, 'posts'),
    where('userId', '==', this.user.uid)
  );

  // ✅ collectionData reactivo — se actualiza automáticamente al publicar
  collectionData(q, { idField: 'id' }).subscribe({
    next: async (docs: any[]) => {
      const posts = await Promise.all(
        docs.map(async (data: any) => {
          const postId = data.id;

          // Cargar likesCount real
          let likesCount = 0;
          let userReaction: string | null = null;
          try {
            const reactionsSnap = await getDocs(
              collection(this.firestore, `posts/${postId}/reactions`)
            );
            likesCount = reactionsSnap.size;
            const myReaction = reactionsSnap.docs.find(r => r.id === this.user.uid);
            userReaction = myReaction?.data()?.['type'] ?? null;
          } catch {}

          // Cargar comentarios reales
          let comments: any[] = [];
          try {
            const commentsSnap = await getDocs(
              query(
                collection(this.firestore, `posts/${postId}/comments`),
                orderBy('createdAt', 'asc')
              )
            );
            comments = commentsSnap.docs.map(c => ({
              id: c.id,
              userId: c.data()['userId'],
              userName: c.data()['userName'],
              userAvatar: c.data()['userAvatar'] || '',
              text: c.data()['text'],
              createdAt: c.data()['createdAt'] instanceof Timestamp
                ? c.data()['createdAt'].toDate()
                : new Date()
            }));
          } catch {}

          return {
            id: postId,
            userId: data.userId,
            userName: data.userName,
            userAvatar: data.userAvatar || '',
            type: data.type || 'post',
            content: data.content || '',
            imageUrl: data.imageUrl || null,
            videoUrl: data.videoUrl || null,
            tags: data.tags || [],
            // ✅ fixDate maneja serverTimestamp pendiente (puede llegar null la primera vez)
            createdAt: this.fixDate(data.createdAt),
            showComments: false,
            newComment: '',
            likesCount,
            userReaction,
            commentsCount: comments.length,
            comments,
            repostsCount: data.repostsCount || 0
          };
        })
      );

      // ✅ Ordenar en memoria (desc) — evita índice compuesto en Firestore
      this.myPosts = posts.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      );

      this.buildProfileFeed();
    },
    error: (err) => console.error('Error cargando posts del perfil:', err)
  });
}
  // =============================
  // LIKE POST
  // =============================
  async toggleLike(post: any) {
    if (!this.user) return;

    const ref = doc(this.firestore, `posts/${post.id}/reactions/${this.user.uid}`);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      await deleteDoc(ref);
      post.likesCount = Math.max(0, (post.likesCount || 0) - 1);
    } else {
      await setDoc(ref, {
  type: 'like',
  userId: this.user.uid,
  userName: this.user.displayName,
  userAvatar: this.avatar || this.user.photoURL || '',
  createdAt: serverTimestamp()
});
      post.likesCount = (post.likesCount || 0) + 1;
    }
  }

  // =============================
  // COMENTARIOS POST
  // =============================
  showCommentInput(post: any) {
    post.showComments = !post.showComments;
  }

  async addComment(post: any) {
    if (!this.user || !post.newComment?.trim()) return;

    const commentsRef = collection(this.firestore, `posts/${post.id}/comments`);

    await addDoc(commentsRef, {
      userId: this.user.uid,
      userName: this.user.displayName,
      userAvatar: this.avatar || this.user.photoURL || '',
      text: post.newComment,
      createdAt: serverTimestamp()
    });

    post.newComment = '';
    post.commentsCount = (post.commentsCount || 0) + 1;
  }

  // =============================
  // REPOST (POST O REEL)
  // =============================
  async repost(item: any) {
    if (!this.user) return;

    await addDoc(collection(this.firestore, 'posts'), {
      ...item,
      type: 'repost',
      repostedById: this.user.uid,
      repostedByName: this.user.displayName,
      createdAt: serverTimestamp()
    });

    item.repostsCount = (item.repostsCount || 0) + 1;
  }

  // =============================
//  IMÁGENES (AVATAR / PORTADA)
// =============================
async resizeImage(
  file: File,
  maxW = 1000,
  maxH = 400,
  quality = 0.7
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e: any) => (img.src = e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);

    img.onload = () => {
      let { width, height } = img;

      if (width > maxW) {
        height = (maxW / width) * height;
        width = maxW;
      }

      if (height > maxH) {
        width = (maxH / height) * width;
        height = maxH;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);

      resolve(canvas.toDataURL('image/jpeg', quality));
    };

    img.onerror = reject;
  });
}

/* ========= AVATAR ========= */
async onAvatarSelected(event: any) {
  const file = event.target.files?.[0];
  if (!file || !this.user) return;

  this.avatar = await this.resizeImage(file, 300, 300, 0.8);
  await updateDoc(doc(this.firestore, `users/${this.user.uid}`), {
    avatar: this.avatar,
    updatedAt: serverTimestamp()
  });
}

async removeAvatar() {
  if (!this.user) return;

  this.avatar = '';
  await updateDoc(doc(this.firestore, `users/${this.user.uid}`), {
    avatar: '',
    updatedAt: serverTimestamp()
  });
}

/* ========= PORTADA ========= */
async onCoverSelected(event: any) {
  const file = event.target.files?.[0];
  if (!file || !this.user) return;

  this.cover = await this.resizeImage(file, 1200, 450, 0.8);
  await updateDoc(doc(this.firestore, `users/${this.user.uid}`), {
    cover: this.cover,
    updatedAt: serverTimestamp()
  });
}

async removeCover() {
  if (!this.user) return;

  this.cover = '';
  await updateDoc(doc(this.firestore, `users/${this.user.uid}`), {
    cover: '',
    updatedAt: serverTimestamp()
  });
}

async getPostReactions(postId: string) {
  const snap = await getDocs(
    collection(this.firestore, `posts/${postId}/reactions`)
  );

  return snap.docs.map(d => ({
    userId: d.data()['userId'],
    userName: d.data()['userName'],
    userAvatar: d.data()['userAvatar'],
    type: d.data()['type']
  }));
}

async showReactions(item: any) {

  let path = '';

  if (item.type === 'post') {
    path = `posts/${item.id}/reactions`;
  } else if (item.type === 'reel') {
    path = `reels/${item.id}/likes`;
  }

  const snap = await getDocs(collection(this.firestore, path));

  this.reactionsList = snap.docs.map(d => ({
    userId: d.data()['userId'],
    userName: d.data()['userName'],
    userAvatar: d.data()['userAvatar'],
    type: d.data()['type']
  }));

  this.showReactionsModal = true;
}

getReactionEmoji(type: string): string {
  switch (type) {
    case 'like': return '👍';
    case 'love': return '❤️';
    case 'haha': return '😂';
    case 'wow': return '😮';
    case 'sad': return '😢';
    case 'angry': return '😡';
    default: return '👍';
  }
}

async endHoldPost(post: any) {
  clearTimeout(this.holdTimer);

  if (!this.longPressTriggered) {
    await this.reactToPost(post, 'like');
  }
}

async selectReactionPost(post: any, type: ReactionType) {
  await this.reactToPost(post, type);
  this.reactionMenuVisible = false;
  this.reactionMenuItem = null;
}

async reactToPost(post: any, type: ReactionType) {
  if (!this.user) return;

  const ref = doc(this.firestore, `posts/${post.id}/reactions/${this.user.uid}`);
  const snap = await getDoc(ref);

  // Si ya reaccionó con el mismo tipo → eliminar
  if (snap.exists() && snap.data()['type'] === type) {
    await deleteDoc(ref);
    post.likesCount = Math.max(0, post.likesCount - 1);
    post.userReaction = null;
    return;
  }

  // Si cambia reacción o es nueva
  await setDoc(ref, {
    type,
    userId: this.user.uid,
    userName: this.user.displayName,
    userAvatar: this.avatar || this.user.photoURL || '',
    createdAt: serverTimestamp()
  });

  if (!snap.exists()) {
    post.likesCount++;
  }

  post.userReaction = type;
}

onClickReaction(item: any) {
  // Si hay reacciones → mostrar modal
  if ((item.likesCount || item.likes) > 0) {
    this.showReactions(item.id);
  } else {
    // Si no hay → dar like directo
    this.reactToPost(item, 'like');
  }
}
}
