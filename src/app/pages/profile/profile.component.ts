import { Component, NgZone, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { updateProfile } from '@angular/fire/auth';
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
import { UserService } from '../../services/user.service';
import { FollowersComponent } from '../../components/followers/followers.component';
import { NotificationService } from '../../services/notification.service';

const MAX_IMAGE_FILE_SIZE = 5 * 1024 * 1024;
const MAX_IMAGE_DATA_URL_LENGTH = 400_000;
const DEFAULT_AVATAR = 'https://cdn-icons-png.flaticon.com/512/847/847969.png';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, FollowersComponent],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent {

  auth = inject(AuthService);
  firestore = inject(Firestore);
  postService = inject(PostService);
  userService = inject(UserService);
  private notificationService = inject(NotificationService);
  private zone = inject(NgZone);

  user: any = null;

  followerCount = 0;
  followingCount = 0;
  activeFollowList: 'followers' | 'following' | null = null;

  // PERFIL
  displayName = '';
  profileName = '';
  readonly defaultAvatar = DEFAULT_AVATAR;
  bio = '';
  location = '';
  careerOrArea = '';
  birthDate = '';
  birthPlace = '';
  avatar = '';
  avatarWasRemoved = false;
  cover = '';
  editing = false;
  profileLoading = true;
  profileSaving = false;
  profileError = '';
  profileNotice = '';

  private savedProfile = {
    displayName: '',
    bio: '',
    location: '',
    careerOrArea: '',
    birthDate: '',
    birthPlace: ''
  };

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
    this.auth.user$.subscribe(async u => {
      this.user = u;
      if (u) {
        this.loadUserProfile();
        this.loadUserPosts();
        this.loadUserReels();
        this.loadFollowCounts();
      } else {
        this.profileLoading = false;
        this.profileName = '';
        this.displayName = '';
        this.bio = '';
        this.location = '';
        this.careerOrArea = '';
        this.birthDate = '';
        this.birthPlace = '';
        this.avatar = '';
        this.avatarWasRemoved = false;
        this.cover = '';
        this.myPosts = [];
        this.myReels = [];
        this.profileFeed = [];
        this.followerCount = 0;
        this.followingCount = 0;
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
    this.profileLoading = true;
    try {
      const ref = doc(this.firestore, `users/${this.user.uid}`);
      const snap = await getDoc(ref);
      const data = snap.exists() ? snap.data() : {};

      this.zone.run(() => {
        this.profileName = data['displayName'] || this.user.displayName || '';
        this.displayName = this.profileName;
        this.bio = typeof data['bio'] === 'string' ? data['bio'] : data['descripcion'] || '';
        this.location = typeof data['location'] === 'string' ? data['location'] : '';
        this.careerOrArea = typeof data['careerOrArea'] === 'string'
          ? data['careerOrArea']
          : data['career'] || data['carrera'] || data['area'] || '';
        this.birthDate = typeof data['birthDate'] === 'string'
          ? data['birthDate']
          : data['fechaNacimiento'] || '';
        this.birthPlace = typeof data['birthPlace'] === 'string'
          ? data['birthPlace']
          : data['ciudad'] || '';
        this.avatar = typeof data['avatar'] === 'string' ? data['avatar'] : '';
        this.avatarWasRemoved = Object.hasOwn(data, 'avatar') && !this.avatar;
        this.cover = typeof data['cover'] === 'string' ? data['cover'] : '';
        this.saveCurrentProfileAsOriginal();
        this.profileLoading = false;
      });
    } catch (error) {
      console.error('Error cargando el perfil:', error);
      this.zone.run(() => {
        this.profileError = 'No se pudo cargar tu perfil. Inténtalo de nuevo más tarde.';
        this.profileLoading = false;
      });
    }
  }

  async saveProfile() {
    if (!this.user || this.profileSaving) return;

    const updatedProfile = {
      displayName: this.displayName.trim(),
      bio: this.bio.trim(),
      location: this.location.trim(),
      careerOrArea: this.careerOrArea.trim(),
      birthDate: this.birthDate,
      birthPlace: this.birthPlace.trim()
    };

    if (
      !updatedProfile.displayName ||
      updatedProfile.displayName.length > 80 ||
      updatedProfile.bio.length > 300 ||
      updatedProfile.location.length > 100 ||
      updatedProfile.careerOrArea.length > 100 ||
      updatedProfile.birthPlace.length > 100
    ) {
      this.profileError = 'Revisa los campos: el nombre es obligatorio y algunos textos superan su límite.';
      return;
    }

    this.profileSaving = true;
    this.profileError = '';
    this.profileNotice = '';
    try {
      await setDoc(doc(this.firestore, `users/${this.user.uid}`), {
        ...updatedProfile,
        email: this.user.email || null,
        updatedAt: serverTimestamp()
      }, { merge: true });

      this.profileName = updatedProfile.displayName;
      this.saveCurrentProfileAsOriginal();
      this.editing = false;

      try {
        await updateProfile(this.user, { displayName: updatedProfile.displayName });
        this.profileNotice = 'Perfil guardado correctamente.';
      } catch (error) {
        console.error('El perfil se guardó, pero no se sincronizó el nombre de Auth:', error);
        this.profileNotice =
          'Tus datos se guardaron, pero no se pudo sincronizar el nombre de la cuenta.';
      }
    } catch (error) {
      console.error('Error guardando el perfil:', error);
      this.profileError = 'No se pudo guardar el perfil. Comprueba tu conexión e inténtalo de nuevo.';
    } finally {
      this.profileSaving = false;
    }
  }

  beginEditing() {
    this.profileError = '';
    this.profileNotice = '';
    this.editing = true;
  }

  cancelEditing() {
    this.displayName = this.savedProfile.displayName;
    this.bio = this.savedProfile.bio;
    this.location = this.savedProfile.location;
    this.careerOrArea = this.savedProfile.careerOrArea;
    this.birthDate = this.savedProfile.birthDate;
    this.birthPlace = this.savedProfile.birthPlace;
    this.profileError = '';
    this.editing = false;
  }

  private saveCurrentProfileAsOriginal() {
    this.savedProfile = {
      displayName: this.displayName,
      bio: this.bio,
      location: this.location,
      careerOrArea: this.careerOrArea,
      birthDate: this.birthDate,
      birthPlace: this.birthPlace
    };
  }

  async loadFollowCounts() {
    if (!this.user?.uid) return;

    const counts = await this.userService.getFollowCounts(this.user.uid);
    this.followerCount = counts.followersCount;
    this.followingCount = counts.followingCount;
  }

  toggleFollowList(list: 'followers' | 'following') {
    this.activeFollowList = this.activeFollowList === list ? null : list;
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

    const previousReaction = reel.userReaction;
    const result = await this.postService.applyReactionToReel(
      reel.id,
      this.user.uid,
      type
    );

    reel.likes = result.total;
    reel.userReaction = result.userReaction;

    if (previousReaction !== result.userReaction && result.userReaction && reel.uid) {
      try {
        await this.notificationService.createNotification({
          toUid: reel.uid,
          fromUid: this.user.uid,
          fromName: this.user.displayName || 'Usuario',
          fromAvatar: this.avatar || this.user.photoURL || '',
          type: 'reaction',
          reelId: reel.id
        });
      } catch (error) {
        console.error('No se pudo notificar la reacción al reel:', error);
      }
    }
  }

  // =============================
  // COMENTARIOS REEL
  // =============================
  async addReelComment(reel: any) {
    if (!this.user || !reel.newComment?.trim()) return;

    const text = reel.newComment.trim();
    await this.postService.addCommentReel(reel.id!, {
      userId: this.user.uid,
      userName: this.user.displayName,
      userAvatar: this.avatar || this.user.photoURL || '',
      content: text
    });

    try {
      await this.notificationService.notifyReelComment({
        toUid: reel.uid,
        fromUid: this.user.uid,
        fromName: this.user.displayName || 'Usuario',
        fromAvatar: this.avatar || this.user.photoURL || '',
        reelId: reel.id,
        text
      });
    } catch (error) {
      console.error('No se pudo notificar el comentario al reel:', error);
    }

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

      if (post.userId) {
        try {
          await this.notificationService.notifyReaction({
            toUid: post.userId,
            fromUid: this.user.uid,
            fromName: this.user.displayName || 'Usuario',
            fromAvatar: this.avatar || this.user.photoURL || '',
            postId: post.id
          });
        } catch (error) {
          console.error('No se pudo notificar la reacción:', error);
        }
      }
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

    const text = post.newComment.trim();
    await addDoc(commentsRef, {
      userId: this.user.uid,
      userName: this.user.displayName,
      userAvatar: this.avatar || this.user.photoURL || '',
      text,
      createdAt: serverTimestamp()
    });

    if (post.userId) {
      try {
        await this.notificationService.notifyComment({
          toUid: post.userId,
          fromUid: this.user.uid,
          fromName: this.user.displayName || 'Usuario',
          fromAvatar: this.avatar || this.user.photoURL || '',
          postId: post.id,
          text
        });
      } catch (error) {
        console.error('No se pudo notificar el comentario:', error);
      }
    }

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

    const originalUid = item.uid || item.userId || item.originalAuthorId;
    try {
      if (originalUid) {
        const isReel = item.type === 'reel' || !!item.videoUrl && !!item.uid;
        await this.notificationService.notifyRepost({
          toUid: originalUid,
          fromUid: this.user.uid,
          fromName: this.user.displayName || 'Usuario',
          fromAvatar: this.avatar || this.user.photoURL || '',
          ...(isReel ? { reelId: item.id } : { postId: item.id })
        });
      }
    } catch (error) {
      console.error('No se pudo notificar el repost:', error);
    }

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
  if (!file.type.startsWith('image/')) {
    throw new Error('Selecciona un archivo de imagen.');
  }
  if (file.size > MAX_IMAGE_FILE_SIZE) {
    throw new Error('La imagen no puede superar los 5 MB.');
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('No se pudo leer la imagen.'));
        return;
      }
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
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
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('El navegador no pudo procesar la imagen.'));
        return;
      }
      context.drawImage(img, 0, 0, width, height);

      try {
        let resizedImage = canvas.toDataURL('image/jpeg', quality);
        for (let imageQuality = quality - 0.15;
          resizedImage.length > MAX_IMAGE_DATA_URL_LENGTH && imageQuality >= 0.2;
          imageQuality -= 0.15) {
          resizedImage = canvas.toDataURL('image/jpeg', imageQuality);
        }
        if (resizedImage.length > MAX_IMAGE_DATA_URL_LENGTH) {
          reject(new Error('La imagen procesada es demasiado grande. Prueba con otra imagen.'));
          return;
        }
        resolve(resizedImage);
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => reject(new Error('El archivo seleccionado no es una imagen válida.'));
  });
}

/* ========= AVATAR ========= */
async onAvatarSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !this.user) return;

  this.profileError = '';
  this.profileNotice = '';
  try {
    const avatar = await this.resizeImage(file, 300, 300, 0.8);
    await setDoc(doc(this.firestore, `users/${this.user.uid}`), {
      avatar,
      updatedAt: serverTimestamp()
    }, { merge: true });
    this.avatar = avatar;
    this.avatarWasRemoved = false;
    this.profileNotice = 'Foto de perfil actualizada.';
  } catch (error) {
    console.error('Error actualizando la foto de perfil:', error);
    this.profileError = error instanceof Error
      ? error.message
      : 'No se pudo actualizar la foto de perfil.';
  } finally {
    input.value = '';
  }
}

async removeAvatar() {
  if (!this.user) return;

  this.profileError = '';
  this.profileNotice = '';
  try {
    await setDoc(doc(this.firestore, `users/${this.user.uid}`), {
      avatar: '',
      updatedAt: serverTimestamp()
    }, { merge: true });
    this.avatar = '';
    this.avatarWasRemoved = true;
    this.profileNotice = 'Foto de perfil eliminada.';
  } catch (error) {
    console.error('Error eliminando la foto de perfil:', error);
    this.profileError = 'No se pudo eliminar la foto de perfil.';
  }
}

/* ========= PORTADA ========= */
async onCoverSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !this.user) return;

  this.profileError = '';
  this.profileNotice = '';
  try {
    const cover = await this.resizeImage(file, 1200, 450, 0.8);
    await setDoc(doc(this.firestore, `users/${this.user.uid}`), {
      cover,
      updatedAt: serverTimestamp()
    }, { merge: true });
    this.cover = cover;
    this.profileNotice = 'Portada actualizada.';
  } catch (error) {
    console.error('Error actualizando la portada:', error);
    this.profileError = error instanceof Error
      ? error.message
      : 'No se pudo actualizar la portada.';
  } finally {
    input.value = '';
  }
}

async removeCover() {
  if (!this.user) return;

  this.profileError = '';
  this.profileNotice = '';
  try {
    await setDoc(doc(this.firestore, `users/${this.user.uid}`), {
      cover: '',
      updatedAt: serverTimestamp()
    }, { merge: true });
    this.cover = '';
    this.profileNotice = 'Portada eliminada.';
  } catch (error) {
    console.error('Error eliminando la portada:', error);
    this.profileError = 'No se pudo eliminar la portada.';
  }
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
