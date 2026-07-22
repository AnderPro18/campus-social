import { Component, OnInit, inject, Renderer2 } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, collectionData, addDoc, query, orderBy, serverTimestamp, Timestamp, 
doc, getDoc, setDoc, deleteDoc, updateDoc, increment, getDocs, where } from '@angular/fire/firestore';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { SavedService } from '../../services/saved.service';
import { PostService } from '../../services/post.service';
import { Router } from '@angular/router';
import { NotificationService } from '../../services/notification.service';
// ------------------------------------------------------
// INTERFACES
// ------------------------------------------------------
export interface Post {
  id?: string;

  userId?: string;
  userName?: string;
  userAvatar?: string;

  type?: 'original' | 'repost';

  originalPostId?: string;
  originalAuthorId?: string;
  originalAuthorName?: string;
  originalCreatedAt?: Date;
  originalAuthorAvatar?: string;

  repostedById?: string;
  repostedByName?: string;

  content: string;
  imageUrl?: string;

  videoUrl?: string;
  tags?: string[];

  createdAt: Date;

  repostDate?: Date;

  likesCount?: number;
  commentsCount?: number;
  repostsCount?: number;
}

export interface CommentItem {
  id?: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  text: string;
  createdAt: Date;
  userReaction?: ReactionType;
  reactionsCount?: number;
}

type ReactionType =
  | 'like'
  | 'love'
  | 'haha'
  | 'wow'
  | 'sad'
  | 'angry';

@Component({
  selector: 'app-feed',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './feed.component.html',
  styleUrls: ['./feed.component.scss'],
})
export class FeedComponent implements OnInit {
  private postService = inject(PostService);
  private postsSubject = new BehaviorSubject<Post[]>([]);
  posts$ = this.postsSubject.asObservable();
  private router = inject(Router);
  private commentReactions: Record<string, Record<string, ReactionType>> = {};
  private notificationService = inject(NotificationService);

  newContent = '';
  selectedFileBase64: string | null = null;
  isPublishing = false;

  private firestore = inject(Firestore);
  authService = inject(AuthService);
  savedService = inject(SavedService);
  renderer = inject(Renderer2);
  private auth = inject(AuthService);

  commentsMap: Record<string, CommentItem[]> = {};
  currentUid: string | null = null;
  draftComments: Record<string, string> = {};
  repliesMap: Record<string, any[]> = {};
  openCommentsFor: string | null = null;

  openMenuId: string | null = null;

  reactionMenuPostId: string | null = null;
  activeReplyCommentId: string | null = null;
  replyDrafts: Record<string, string> = {};
  commentHoldTimeout: any;
  commentReactionMenuId: string | null = null;
  commentReactionMenuPos = { left: 0, top: 0 };
  editingCommentId: string | null = null;
  editCommentDraft = '';
  reactionMenuPos = { left: 0, top: 0 };
  reactionMenuVisible = false;
  reactionsList: any[] = [];
  showReactionsModal = false;
  showCommentReactionsModal = false;
  commentReactionsList: any[] = [];
  
  // ─── Menciones ───────────────────────────────────────────────
mentionResults: { uid: string; userName: string; avatar: string }[] = [];
mentionActive = false;
private mentionTimeout: any;

// Para repost en feed
showRepostModal = false;
repostTargetPost: Post | null = null;
repostDescription = '';
repostTags: string[] = [];

  private localReactions: Record<string, Record<string, ReactionType>> = {};
  private holdTimeout = 450;
  private holdTimer: any = null;
  private holdTargetPost: Post | null = null;
  private commentHoldTimer: any = null;
  private commentHoldTimeout2 = 450;
  private holdTargetComment: any = null;
  

  reactionList: { type: ReactionType; label: string; emoji: string }[] = [
    { type: 'like', label: 'Me gusta', emoji: '👍' },
    { type: 'love', label: 'Me encanta', emoji: '❤️' },
    { type: 'haha', label: 'Me divierte', emoji: '😂' },
    { type: 'wow', label: 'Me asombra', emoji: '😮' },
    { type: 'sad', label: 'Me entristece', emoji: '😢' },
    { type: 'angry', label: 'Me enoja', emoji: '😡' },
  ];

  // toast
  toastMessage: string | null = null;

  constructor() {}

  // -----------------------
  // UTIL: fecha segura
  // -----------------------
  private fixDate(raw: any): Date {
    if (!raw) return new Date();
    if (raw instanceof Date) return raw;
    if (raw?.toDate) return raw.toDate();
    return new Date(raw);
  }

  // ------------------------------------------------------
  // CARGAR POSTS (incluye conteo real de reacciones)
  // ------------------------------------------------------
  ngOnInit() {
    // ✅ FIX 1: suscribir uid una sola vez para tenerlo siempre disponible
    this.authService.user$.subscribe(u => {
      this.currentUid = u?.uid ?? null;
    });
 
    const postsCollection = collection(this.firestore, 'posts');
    const q = query(postsCollection, orderBy('createdAt', 'desc'));
 
    collectionData(q, { idField: 'id' }).subscribe({
      next: async (docs: any[]) => {
        const mapped: Post[] = [];
 
        for (const d of docs) {
          const postId = d.id;
 
          // leer reacciones de subcolección para conteo real
          let likesCount = 0;
          try {
            const reactionsSnap = await getDocs(collection(this.firestore, `posts/${postId}/reactions`));
            likesCount = reactionsSnap.size;
            // almacenar localReactions mínimamente
            const temp: Record<string, ReactionType> = {};
            reactionsSnap.forEach(r => {
              const data: any = r.data();
              if (data?.type) temp[r.id] = data.type as ReactionType;
            });
            this.localReactions[postId] = temp;
          } catch (err) {
            console.warn('No se pudieron leer reacciones para post', postId, err);
          }
 
          mapped.push({
            id: postId,
            type: d.type || 'original',
 
            userId: d.userId,
            userName: d.userName,
            userAvatar: d.userAvatar || null,
 
            // 🔁 REPOST
            originalPostId: d.originalPostId || null,
            originalAuthorId: d.originalAuthorId || null,
            originalAuthorName: d.originalAuthorName || null,
            originalAuthorAvatar: d.originalAuthorAvatar || null,
 
            repostedById: d.repostedById || null,
            repostedByName: d.repostedByName || null,
 
            createdAt: this.fixDate(d.createdAt),
            originalCreatedAt: this.fixDate(d.originalCreatedAt),
            repostDate: this.fixDate(d.repostDate),
 
            content: d.content ?? '',
            imageUrl: d.imageUrl ?? null,
 
            videoUrl: d.videoUrl ?? null,
 
            likesCount: likesCount,
            commentsCount: d.commentsCount ?? 0,
            repostsCount: d.repostsCount ?? 0,
          });
        }
 
        this.postsSubject.next(mapped);
      },
      error: (err) => console.error('❌ ERROR AL LEER POSTS:', err),
    });
  }

  // ------------------------------------------------------
  // CREAR POST (guarda userAvatar en el post)
  // ------------------------------------------------------
  private async getUserAvatar(uid: string) {
    try {
      const userDoc = await getDoc(doc(this.firestore, `users/${uid}`));
      if (userDoc.exists()) {
        const data: any = userDoc.data();
        return data?.avatar || null;
      }
    } catch (err) {
      console.warn('Error leyendo avatar de user doc', err);
    }
    return null;
  }

  // === UTILIDADES PARA COMPRESIÓN DE IMÁGENES === //
  private async fileToDataUrl(file: File): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
    });
  }

  private async dataUrlToBlob(dataUrl: string): Promise<Blob> {
    const res = await fetch(dataUrl);
    return await res.blob();
  }

  private async resizeAndCompressImageFile(
    file: File,
    maxWidth = 1200,
    maxHeight = 1200,
    maxBytes = 250_000,
    minQuality = 0.35
  ): Promise<string> {
    let dataUrl = await this.fileToDataUrl(file);

    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = (e) => reject(e);
      img.src = dataUrl!;
    });

    let { width, height } = img;
    let scale = 1;
    if (width > maxWidth) scale = Math.min(scale, maxWidth / width);
    if (height > maxHeight) scale = Math.min(scale, maxHeight / height);
    if (scale <= 0) scale = 1;

    let w = Math.round(width * scale);
    let h = Math.round(height * scale);

    let quality = 0.92;
    let lastDataUrl = dataUrl;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    while (true) {
      canvas.width = w;
      canvas.height = h;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      const newDataUrl = canvas.toDataURL('image/jpeg', quality);
      const blob = await this.dataUrlToBlob(newDataUrl);
      const size = blob.size;

      if (size <= maxBytes) return newDataUrl;

      if (quality > minQuality + 0.05) {
        quality -= 0.15;
        lastDataUrl = newDataUrl;
        continue;
      }

      if (w > 200 && h > 200) {
        w = Math.max(200, Math.round(w * 0.8));
        h = Math.max(200, Math.round(h * 0.8));
        continue;
      }

      return lastDataUrl;
    }
  }

  async onFileSelected(event: any) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Solo se permiten imágenes.');
      return;
    }

    try {
      const compressed = await this.resizeAndCompressImageFile(file, 1200, 1200, 250_000);
      const blob = await this.dataUrlToBlob(compressed);
      console.log("Tamaño final de la imagen:", blob.size, "bytes");
      if (blob.size > 1_000_000) {
        alert("La imagen sigue siendo demasiado grande. Elige otra.");
        return;
      }
      this.selectedFileBase64 = compressed;
    } catch (err) {
      console.error(err);
      alert("Error al procesar la imagen.");
    }
  }

  async addPost() {

  if (!this.newContent.trim() && !this.selectedFileBase64) {
    return;
  }

  if (this.isPublishing) return;

  this.isPublishing = true;

  try {

    const user = await firstValueFrom(this.authService.user$);

    if (!user) {
      alert('Debes iniciar sesión');
      return;
    }

    const avatarFromDoc = await this.getUserAvatar(user.uid);

    const payload = {
      userId: user.uid,
      userName: user.displayName || 'Usuario',
      userAvatar: avatarFromDoc || user.photoURL || '',

      type: 'original',

      content: this.newContent.trim(),

      imageUrl: this.selectedFileBase64 || '',

      createdAt: serverTimestamp(),

      likesCount: 0,
      commentsCount: 0,
      repostsCount: 0,
    };

    console.log('PUBLICANDO:', payload);

    const ref = await addDoc(
      collection(this.firestore, 'posts'),
      payload
    );

    console.log('POST CREADO:', ref.id);

    // 🔔 Notificar a amigos aceptados
    try {
      const avatarFromDocFinal = await this.getUserAvatar(user.uid);
      const friendReqSnap = await getDocs(
        query(collection(this.firestore, 'friendRequests'),
          where('status', '==', 'accepted'))
      );
      const friendUids: string[] = [];
      friendReqSnap.docs.forEach(d => {
        const data = d.data() as any;
        if (data.from === user.uid) friendUids.push(data.to);
        else if (data.to === user.uid) friendUids.push(data.from);
      });
      for (const fUid of friendUids) {
        await this.notificationService.createNotification({
          toUid:      fUid,
          fromUid:    user.uid,
          fromName:   user.displayName || 'Usuario',
          fromAvatar: avatarFromDocFinal || user.photoURL || '',
          type:       'new_post',
          postId:     ref.id,
          text:       (this.newContent || '').slice(0, 80)
        });
      }
    } catch (e) { console.warn('No se pudo notificar a amigos:', e); }

    // limpiar UI
    this.newContent = '';
    this.selectedFileBase64 = null;

    this.showToast('Publicación creada ✔');

  } catch (err: any) {

    console.error('ERROR CREANDO POST:', err);

    alert(
      `${err?.code || 'error'}\n${err?.message || 'Error desconocido'}`
    );

  } finally {

    this.isPublishing = false;

  }
}

  // -----------------------------
  // TOAST + GUARDAR
  // -----------------------------
  showToast(msg: string) {
    this.toastMessage = msg;
    setTimeout(() => (this.toastMessage = null), 2500);
  }

  async save(postId: string) {
  try {
    const result = await this.savedService.toggleSave(postId);

    if (result.saved) {
      this.showToast("Publicación guardada ✔");
      alert("✅ Publicación guardada correctamente");
    } else {
      this.showToast("Guardado eliminado ✖");
      alert("❌ Se quitó de guardados");
    }

  } catch (e) {
    console.error(e);
    alert("⚠ Error al guardar");
  }
}

  // ------------------- helpers de UI --------------------
  private updateLocalExact(postId: string, field: 'likesCount' | 'commentsCount' | 'repostsCount', exactValue: number) {
    const arr = this.postsSubject.getValue();
    const idx = arr.findIndex((p) => p.id === postId);
    if (idx === -1) return;
    const copy = [...arr];
    copy[idx][field] = exactValue;
    this.postsSubject.next(copy);
  }

  private updateLocalDelta(postId: string, field: 'likesCount' | 'commentsCount' | 'repostsCount', delta: number) {
    const arr = this.postsSubject.getValue();
    const idx = arr.findIndex((p) => p.id === postId);
    if (idx === -1) return;
    const copy = [...arr];
    const cur = copy[idx][field] || 0;
    copy[idx][field] = Math.max(0, cur + delta);
    this.postsSubject.next(copy);
  }

  setLocalReaction(postId: string, uid: string, type: ReactionType | null) {
    if (!this.localReactions[postId]) this.localReactions[postId] = {};
    if (type) this.localReactions[postId][uid] = type;
    else delete this.localReactions[postId][uid];
  }

  getLocalReaction(postId: string, uid: string): ReactionType | null {
    return this.localReactions[postId]?.[uid] ?? null;
  }

  getReactionEmoji(type: ReactionType | null): string {
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

getReactionLabel(type: ReactionType | null): string {
  switch (type) {
    case 'like': return 'Me gusta';
    case 'love': return 'Me encanta';
    case 'haha': return 'Me divierte';
    case 'wow': return 'Me asombra';
    case 'sad': return 'Me entristece';
    case 'angry': return 'Me enoja';
    default: return 'Me gusta';
  }
}

  // ------------------------------------------------------
  // REACCIONES (click, hold, seleccionar, etc)
  // ------------------------------------------------------
  startHold(post: Post, evt: any) {
    let x = 0, y = 0;
    if (evt.touches?.length) {
      x = evt.touches[0].clientX; y = evt.touches[0].clientY;
    } else {
      x = evt.clientX; y = evt.clientY;
    }
    this.holdTargetPost = post;
    this.holdTimer = setTimeout(() => this.openReactionMenu(post, x, y), this.holdTimeout);
  }

 endHold(post: Post) {
  if (this.holdTimer) {
    // Timer aún activo = fue click corto → like rápido
    clearTimeout(this.holdTimer);
    this.holdTimer = null;
    this.toggleQuickLike(post);
  }
  // Si holdTimer es null, el menú ya se abrió → no hacer nada aquí
}

  cancelHold() {
    if (this.holdTimer) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
  }

  openReactionMenu(post: Post, x: number, y: number) {
    this.reactionMenuPostId = post.id!;
    this.reactionMenuVisible = true;
    this.reactionMenuPos.left = x - 120;
    this.reactionMenuPos.top = y - 80;
  }

  closeReactionMenu() {
    this.reactionMenuVisible = false;
    this.reactionMenuPostId = null;
  }

  async toggleQuickLike(post: Post) {
  const user = await firstValueFrom(this.authService.user$);
  if (!user) return alert("Inicia sesión.");

  const uid = user.uid;
  const prev = this.getLocalReaction(post.id!, uid);

  // 👉 Si ya hay CUALQUIER reacción → quitarla
  if (prev) {
    await this.applyReaction(post, null);
  } 
  // 👉 Si no hay reacción → poner like
  else {
    await this.applyReaction(post, 'like');
  }
}

  async selectReaction(post: Post, r: ReactionType) {
    await this.applyReaction(post, r);
    this.closeReactionMenu();
  }

  private async applyReaction(post: Post, reaction: ReactionType | null) {
    const user = await firstValueFrom(this.authService.user$);
    if (!user) return;
    const uid = user.uid;
    const ref = doc(this.firestore, `posts/${post.id}/reactions/${uid}`);
    const col = collection(this.firestore, `posts/${post.id}/reactions`);
    const prev = this.getLocalReaction(post.id!, uid);
    const avatarFromDoc = await this.getUserAvatar(user.uid);
    const avatar = avatarFromDoc || user.photoURL || '';

    if (reaction === null) {
      this.setLocalReaction(post.id!, uid, null);
      if (prev) this.updateLocalDelta(post.id!, 'likesCount', -1);
    } else {
      this.setLocalReaction(post.id!, uid, reaction);
      if (!prev) this.updateLocalDelta(post.id!, 'likesCount', +1);
    }

    try {
      const snap = await getDoc(ref);
      if (reaction === null) {
        if (snap.exists()) await deleteDoc(ref);
      } else {
        await setDoc(ref, {
          type: reaction,
          userId: user.uid,
          userName: user.displayName || 'Usuario',
          userAvatar: avatar,
          createdAt: serverTimestamp(),
        });

        if (reaction !== null) {

  await this.notificationService.createNotification({
    toUid: post.userId!,
    fromUid: user.uid,
    fromName: user.displayName || 'Usuario',
    fromAvatar: avatar,
    type: 'reaction',
    postId: post.id
  });

}
      }

      

      const all = await getDocs(col);
      this.updateLocalExact(post.id!, 'likesCount', all.size);
      const temp: Record<string, ReactionType> = {};
      all.forEach((d) => (temp[d.id] = d.data()['type']));
      this.localReactions[post.id!] = temp;
    } catch (err) {
      console.error(err);
    }
  }

  getReactionClass(postId: string, uid?: string | null): string {
  if (!uid) return 'reaction-none'; // 🔑 CLAVE

  const reaction = this.getLocalReaction(postId, uid);

  switch (reaction) {
    case 'like':   return 'reaction-like';
    case 'love':   return 'reaction-love';
    case 'haha':   return 'reaction-haha';
    case 'wow':    return 'reaction-wow';
    case 'sad':    return 'reaction-sad';
    case 'angry':  return 'reaction-angry';
    default:       return 'reaction-none';
  }
}

  // ------------------------------------------------------
  // COMENTARIOS
  // ------------------------------------------------------
  async openComments(post: Post) {
    this.openCommentsFor = post.id!;
    const realId = post.type === 'repost' ? post.originalPostId! : post.id!;
    await this.loadComments(post.id!, realId);
  }

  async loadComments(displayId: string, fetchId: string) {
  try {
    const uid = this.currentUid;

    const q = query(
      collection(this.firestore, `posts/${fetchId}/comments`),
      orderBy('createdAt', 'asc')
    );

    const snap = await getDocs(q);

    const comments: CommentItem[] = [];

    for (const d of snap.docs) {
      const commentId = d.id;

      // Cargar reacciones del comentario
      const reactionsSnap = await getDocs(
        collection(this.firestore, `posts/${fetchId}/comments/${commentId}/reactions`)
      );

      const reactionsCount = reactionsSnap.size;

      // Reacción del usuario actual
      let userReaction: ReactionType | undefined = undefined;
      if (uid) {
        const myReaction = reactionsSnap.docs.find(r => r.id === uid);
        if (myReaction) {
          userReaction = myReaction.data()['type'] as ReactionType;
        }
      }

      comments.push({
        id: commentId,
        userId: d.data()['userId'],
        userName: d.data()['userName'],
        userAvatar: d.data()['userAvatar'] || '',
        text: d.data()['text'],
        createdAt: d.data()['createdAt'] instanceof Timestamp
          ? d.data()['createdAt'].toDate()
          : new Date(),
        userReaction,
        reactionsCount,
      });
    }

    this.commentsMap[displayId] = comments;

    // Cargar respuestas
    for (const c of this.commentsMap[displayId]) {
      if (c.id) await this.loadReplies(fetchId, c.id);
    }

  } catch (err) {
    console.error('Error cargando comentarios', err);
    this.commentsMap[displayId] = [];
  }
}

  async addComment(post: Post, text: string) {
  if (!text || !text.trim()) return;

  const user = await firstValueFrom(this.authService.user$);
  if (!user) return;

  // 🔑 donde se GUARDA el comentario
  const realPostId = this.getRealPostId(post);

  // 🔑 donde se CUENTA (post visible)
  const visiblePostId = this.getVisiblePostId(post);

  // ✅ AQUÍ ESTABA EL ERROR
  const commentsRef = collection(
    this.firestore,
    `posts/${realPostId}/comments`
  );

  const avatarFromDoc = await this.getUserAvatar(user.uid);
  const avatar = avatarFromDoc || user.photoURL || '';

  await this.notificationService.createNotification({
  toUid: post.userId!,
  fromUid: user.uid,
  fromName: user.displayName || 'Usuario',
  fromAvatar: avatar,
  type: 'comment',
  postId: post.id,
  text: text.trim()
});

  await addDoc(commentsRef, {
    userId: user.uid,
    userName: user.displayName || 'Usuario',
    userAvatar: avatar,
    text: text.trim(),
    createdAt: serverTimestamp(),
  });

  // ✅ contador correcto (post visible)
  await updateDoc(
    doc(this.firestore, `posts/${visiblePostId}`),
    { commentsCount: increment(1) }
  );

  this.draftComments[post.id!] = '';
  await this.loadComments(post.id!, realPostId);
  this.showToast('Comentario agregado');
}

  // ------------------------------------------------------
  // REPOST (sin cambios relevantes)
  // ------------------------------------------------------
  async toggleRepost(post: Post) {
    const user = await firstValueFrom(this.authService.user$);
    if (!user) return;

    const postRef = doc(this.firestore, `posts/${post.id}`);
    try {
      await updateDoc(postRef, { repostsCount: increment(1) });
    } catch (err) {
      console.warn('No se pudo incrementar repostsCount', err);
    }

    this.updateLocalDelta(post.id!, 'repostsCount', 1);

    

    await addDoc(collection(this.firestore, 'posts'), {
      type: 'repost',
    originalPostId: post.id,
    originalAuthorId: post.userId,
    originalAuthorName: post.userName,
    originalAuthorAvatar: post.userAvatar || '',
    originalCreatedAt: post.createdAt,
    userId: user.uid,
    userName: user.displayName || 'Usuario',
    repostedById: user.uid,
    repostedByName: user.displayName || 'Usuario',
    content: this.repostDescription || post.content,
    tags: this.repostTags,
    imageUrl: post.imageUrl || '',
    createdAt: serverTimestamp(),
    repostDate: serverTimestamp(),
    likesCount: 0, commentsCount: 0, repostsCount: 0,
  });

  this.showRepostModal = false;
  this.repostTargetPost = null;
  this.showToast('🔁 Publicación reposteada');
}

onContentInput(event: Event) {
  const val = (event.target as HTMLTextAreaElement).value;
  this.newContent = val;
  const match = val.match(/@(\w*)$/);
  if (match) {
    this.mentionActive = true;
    clearTimeout(this.mentionTimeout);
    this.mentionTimeout = setTimeout(() => this.searchUsers(match[1]), 300);
  } else {
    this.mentionActive = false;
    this.mentionResults = [];
  }
}

async searchUsers(queryStr: string) {
  try {
    const snap = await getDocs(collection(this.firestore, 'users'));
    this.mentionResults = snap.docs
      .map(d => ({
        uid: d.id,
        userName: (d.data() as any).displayName || (d.data() as any).userName || '',
        avatar: (d.data() as any).avatar || (d.data() as any).photoURL || '',
      }))
      .filter(u => u.userName && u.userName.toLowerCase().includes(queryStr.toLowerCase()) && u.uid !== this.currentUid)
      .slice(0, 6);
  } catch { this.mentionResults = []; }
}

selectMention(user: { uid: string; userName: string }, field: 'newContent' | 'repostDescription' | string, commentId?: string) {
  const tagName = user.userName.split(' ')[0];
  if (field === 'newContent') {
    this.newContent = this.newContent.replace(/@(\w*)$/, `@${tagName} `);
  } else if (field === 'repostDescription') {
    this.repostDescription = this.repostDescription.replace(/@(\w*)$/, `@${tagName} `);
    if (!this.repostTags.includes(user.userName)) this.repostTags.push(user.userName);
  } else if (commentId) {
    this.draftComments[commentId] = (this.draftComments[commentId] || '').replace(/@(\w*)$/, `@${tagName} `);
  }
  this.mentionActive = false;
  this.mentionResults = [];
}

onCommentInput(event: Event, postId: string) {
  const val = (event.target as HTMLTextAreaElement).value;
  this.draftComments[postId] = val;
  const match = val.match(/@(\w*)$/);
  if (match) {
    this.mentionActive = true;
    this.mentionTimeout = setTimeout(() => this.searchUsers(match[1]), 300);
  } else {
    this.mentionActive = false;
    this.mentionResults = [];
  }
}

onRepostDescInput(event: Event) {
  const val = (event.target as HTMLTextAreaElement).value;
  this.repostDescription = val;
  const match = val.match(/@(\w*)$/);
  if (match) {
    this.mentionActive = true;
    clearTimeout(this.mentionTimeout);
    this.mentionTimeout = setTimeout(() => this.searchUsers(match[1]), 300);
  } else {
    this.mentionActive = false;
    this.mentionResults = [];
  }
}

removeRepostTag(tag: string) {
  this.repostTags = this.repostTags.filter(t => t !== tag);
}

openRepostModal(post: Post) {
  this.repostTargetPost = post;
  this.repostDescription = '';
  this.repostTags = [];
  this.mentionResults = [];
  this.mentionActive = false;
  this.showRepostModal = true;
}

async confirmRepost() {
  const post = this.repostTargetPost;
  if (!post) return;

  // toggleRepost ya hace TODO: incrementa contador + escribe doc en Firestore
  await this.toggleRepost(post);
}
  // ------------------------------------------------------
  // MENÚ, ELIMINAR, REPORTAR
  // ------------------------------------------------------
  toggleMenu(id: string) {
    this.openMenuId = this.openMenuId === id ? null : id;
  }

  async deletePost(id: string) {
    if (!confirm('¿Deseas eliminar esta publicación?')) return;
    try {
      await deleteDoc(doc(this.firestore, `posts/${id}`));
      this.postsSubject.next(this.postsSubject.getValue().filter((p) => p.id !== id));
    } catch (err) {
      console.error('Error eliminando post', err);
      alert('No se pudo eliminar la publicación.');
    }
  }

  hidePost(id: string) {
    this.postsSubject.next(this.postsSubject.getValue().filter((p) => p.id !== id));
  }

  async reportPost(id: string) {
    const reason = prompt('Motivo del reporte:');
    if (!reason?.trim()) return;
    const user = await firstValueFrom(this.authService.user$);
    await addDoc(collection(this.firestore, 'reports'), {
      postId: id,
      reason: reason.trim(),
      reporterId: user?.uid,
      reporterName: user?.displayName,
      createdAt: serverTimestamp(),
    });
    alert('Reporte enviado.');
  }

  async replyToComment(post: any, comment: any) {
  const text = this.replyDrafts[comment.id];
  if (!text?.trim()) return;

  const user = await firstValueFrom(this.authService.user$);
  if (!user) return;

  const realPostId = this.getRealPostId(post);
  const avatarFromDoc = await this.getUserAvatar(user.uid);
  const avatar = avatarFromDoc || user.photoURL || '';

  await this.postService.replyToComment(
    realPostId,
    comment.id,
    {
      userId: user.uid,
      userName: user.displayName || 'Usuario',
      userAvatar: avatar,
      text: text.trim()
    }
  );

  this.replyDrafts[comment.id] = '';
  this.activeReplyCommentId = null;

  // ✅ CLAVE: recargar respuestas inmediatamente
  await this.loadReplies(realPostId, comment.id);
}

async reactToComment(post: any, comment: any, type: ReactionType) {
  const user = await firstValueFrom(this.authService.user$);
  if (!user) return;

  const realPostId = this.getRealPostId(post);

  await this.postService.reactToComment(
    realPostId,
    comment.id,
    user.uid,
    type
  );
}

getRealPostId(post: any): string {
  return post.type === 'repost' && post.originalPostId
    ? post.originalPostId
    : post.id;
}

async confirmDeleteComment(post: any, comment: any) {
  const ok = confirm('¿Seguro que deseas eliminar este comentario?');
  if (!ok) return;

  const realPostId = this.getRealPostId(post);

  await deleteDoc(
    doc(this.firestore, `posts/${realPostId}/comments/${comment.id}`)
  );

  const real = this.getRealPostPath(post);

const visibleId = this.getVisiblePostId(post);

await updateDoc(
  doc(this.firestore, `posts/${visibleId}`),
  { commentsCount: increment(-1) }
);

  await this.loadComments(post.id!, realPostId);
  this.showToast('Comentario eliminado');
}

startEditComment(comment: any) {
  this.editingCommentId = comment.id;
  this.editCommentDraft = comment.text;
}

cancelEditComment() {
  this.editingCommentId = null;
  this.editCommentDraft = '';
}

async saveEditComment(post: any, comment: any) {
  if (!this.editCommentDraft.trim()) return;

  const realPostId = this.getRealPostId(post);

await updateDoc(
  doc(this.firestore, `posts/${realPostId}/comments/${comment.id}`),
  {
    text: this.editCommentDraft,
    updatedAt: serverTimestamp()
  }
);

  comment.text = this.editCommentDraft;
  this.cancelEditComment();
}

async loadReplies(postId: string, commentId: string) {
  const q = query(
    collection(this.firestore, `posts/${postId}/comments/${commentId}/replies`),
    orderBy('createdAt', 'asc')
  );

  const snap = await getDocs(q);

  this.repliesMap[commentId] = snap.docs.map(d => ({
    id: d.id,
    userId: d.data()['userId'],
    userName: d.data()['userName'],
    userAvatar: d.data()['userAvatar'] || '',
    text: d.data()['text'],
    createdAt: d.data()['createdAt']?.toDate?.() || new Date()
  }));
}
getRealPostPath(post: any): { collection: 'posts' | 'reels', id: string } {
  if (post.originalType === 'reel') {
    return { collection: 'reels', id: post.originalPostId };
  }

  if (post.type === 'repost' && post.originalPostId) {
    return { collection: 'posts', id: post.originalPostId };
  }

  return { collection: 'posts', id: post.id };
}

async deleteReply(post: any, comment: any, reply: any) {
  const user = await firstValueFrom(this.authService.user$);
  if (!user || user.uid !== reply.userId) return;

  const real = this.getRealPostPath(post);

  await deleteDoc(
    doc(
      this.firestore,
      `${real.collection}/${real.id}/comments/${comment.id}/replies/${reply.id}`
    )
  );

  // ✅ Actualizar repliesMap inmediatamente sin recargar desde Firestore
  if (this.repliesMap[comment.id]) {
    this.repliesMap[comment.id] = this.repliesMap[comment.id].filter(
      r => r.id !== reply.id
    );
  }

  this.showToast('Respuesta eliminada');
}
async goToProfile(userId?: string) {
  if (!userId || userId.trim() === '') {
    console.warn('goToProfile bloqueado: userId inválido', userId);
    return;
  }

  const user = await firstValueFrom(this.authService.user$);
  const myUid = user?.uid;

  if (userId === myUid) {
    this.router.navigateByUrl('/profile');
  } else {
    this.router.navigateByUrl(`/user/${userId}`);
  }
}

getVisiblePostId(post: any): string {
  // si es repost, el post visible sigue siendo el original para contadores
  return post.type === 'repost' && post.originalPostId
    ? post.originalPostId
    : post.id;
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

async showReactions(postId: string) {
  this.reactionsList = await this.getPostReactions(postId);
  this.showReactionsModal = true;
}

extractTags(text: string): string[] {
  const matches = text.match(/@(\w+)/g);
  return matches ? matches.map(t => t.replace('@', '')) : [];
}

async goToUserByName(tag: string) {
  const username = tag.replace('@', '').toLowerCase();

  try {
    const snap = await getDocs(collection(this.firestore, 'users'));

    const found = snap.docs.find(d => {
      const data = d.data() as any;
      const name = (data.displayName || data.userName || '').toLowerCase();
      return name.startsWith(username) || username.startsWith(name);
    });

    if (!found) return;

    const user = await firstValueFrom(this.authService.user$);
    const path = found.id === user?.uid ? '/profile' : `/user/${found.id}`;
    this.router.navigateByUrl(path);

  } catch (err) {
    console.error(err);
  }
}
getCommentReaction(commentId: string, uid?: string | null): ReactionType | null {
  if (!uid) return null;
  return this.commentReactions[commentId]?.[uid] ?? null;
}

setCommentReaction(commentId: string, uid: string, type: ReactionType | null) {
  if (!this.commentReactions[commentId]) {
    this.commentReactions[commentId] = {};
  }

  if (type) this.commentReactions[commentId][uid] = type;
  else delete this.commentReactions[commentId][uid];
}

openCommentReactionMenu(commentId: string) {
  if (this.commentReactionMenuId === commentId) {
    this.commentReactionMenuId = null; // toggle OFF
  } else {
    this.commentReactionMenuId = commentId; // toggle ON
  }
}

closeCommentReactionMenu() {
  this.commentReactionMenuId = null;
}

async selectCommentReaction(post: any, comment: any, reactionType: string) {
  const user = await firstValueFrom(this.authService.user$);
  if (!user) return;

  const realPostId = this.getRealPostId(post);
  const uid = user.uid;
  const ref = doc(this.firestore, `posts/${realPostId}/comments/${comment.id}/reactions/${uid}`);

  const prev = comment.userReaction;

  if (prev === reactionType) {
    // misma reacción → quitar
    comment.userReaction = undefined;
    comment.reactionsCount = Math.max(0, (comment.reactionsCount || 1) - 1);
    await deleteDoc(ref);
  } else {
    // nueva o distinta reacción
    comment.userReaction = reactionType as ReactionType;
    if (!prev) comment.reactionsCount = (comment.reactionsCount || 0) + 1;
    const avatarFromDoc = await this.getUserAvatar(uid);
    await setDoc(ref, {
      type: reactionType,
      userId: uid,
      userName: user.displayName || 'Usuario',
      userAvatar: avatarFromDoc || user.photoURL || '',
      createdAt: serverTimestamp(),
    });
  }

  this.commentReactionMenuId = null;
}

startCommentHold(post: any, c: CommentItem, event: any) {
  this.holdTargetComment = c;
  this.commentHoldTimer = setTimeout(() => {
    this.commentReactionMenuId = c.id ?? null;
  }, this.commentHoldTimeout2);
}

endCommentHold(post: any, c: CommentItem) {
  if (this.commentHoldTimer) {
    // Timer aún activo = click corto → toggle reacción
    clearTimeout(this.commentHoldTimer);
    this.commentHoldTimer = null;
    this.toggleQuickCommentReaction(post, c);
  }
  // Si timer ya disparó = menú abierto → no hacer nada
}

cancelCommentHold() {
  if (this.commentHoldTimer) {
    clearTimeout(this.commentHoldTimer);
    this.commentHoldTimer = null;
  }
}

async toggleQuickCommentReaction(post: any, c: CommentItem) {
  const user = await firstValueFrom(this.authService.user$);
  if (!user) return;

  const realPostId = this.getRealPostId(post);
  const uid = user.uid;
  const ref = doc(this.firestore, `posts/${realPostId}/comments/${c.id}/reactions/${uid}`);

  if (c.userReaction) {
    c.userReaction = undefined;
    c.reactionsCount = Math.max(0, (c.reactionsCount || 1) - 1);
    await deleteDoc(ref);
  } else {
    c.userReaction = 'like';
    c.reactionsCount = (c.reactionsCount || 0) + 1;
    const avatarFromDoc = await this.getUserAvatar(uid);
    await setDoc(ref, {
      type: 'like',
      userId: uid,
      userName: user.displayName || 'Usuario',
      userAvatar: avatarFromDoc || user.photoURL || '',
      createdAt: serverTimestamp(),
    });
  }
}

async showCommentReactions(comment: CommentItem) {
  // reactionsCount es opcional; la lista viene de la subcolección
  // Necesitamos el postId — lo buscamos por el commentId en commentsMap
  let postId = '';
  for (const [pid, comments] of Object.entries(this.commentsMap)) {
    if (comments.some(c => c.id === comment.id)) {
      postId = pid;
      break;
    }
  }
  if (!postId || !comment.id) return;

  const snap = await getDocs(
    collection(this.firestore, `posts/${postId}/comments/${comment.id}/reactions`)
  );

  this.commentReactionsList = snap.docs.map(d => ({
    userId:    d.data()['userId'],
    userName:  d.data()['userName'],
    userAvatar: d.data()['userAvatar'],
    type:      d.data()['type'],
  }));

  this.showCommentReactionsModal = true;
}

getCommentWithMentions(text: string): { text: string; isMention: boolean; userName: string }[] {
  if (!text) return [];
  const parts = text.split(/(@\w+)/g);
  return parts.map(part => ({
    text: part,
    isMention: /^@\w+/.test(part),
    userName: part.replace('@', ''),
  }));
}

async goToMentionedUser(userName: string) {
  try {
    const snap = await getDocs(collection(this.firestore, 'users'));
    const lowerTarget = userName.toLowerCase();

    const found = snap.docs.find(d => {
      const data = d.data() as any;
      const fullName = (data.displayName || data.userName || '').toLowerCase();
      return fullName.startsWith(lowerTarget) || lowerTarget.startsWith(fullName);
    });

    if (!found) {
      console.warn('Usuario no encontrado:', userName);
      return;
    }

    const user = await firstValueFrom(this.authService.user$);
    const path = found.id === user?.uid ? '/profile' : `/user/${found.id}`;
    this.router.navigateByUrl(path);
  } catch (err) {
    console.error(err);
  }
}

}
