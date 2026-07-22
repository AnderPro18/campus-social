import { Component, inject, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { PostService, ReactionType } from '../../services/post.service';
import { AuthService } from '../../services/auth.service';
import {
  Firestore, doc, getDoc, getDocs, setDoc, deleteDoc,
  addDoc, updateDoc, increment, collection, query, orderBy, serverTimestamp, Timestamp
} from '@angular/fire/firestore';
import { ActivatedRoute, Router } from '@angular/router';
import { SavedService } from '../../services/saved.service';
import { Reel } from '../../models/reel.model';

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

@Component({
  selector: 'app-reels',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reels.component.html',
  styleUrls: ['./reels.component.scss'],
})
export class ReelsComponent implements AfterViewInit {

  postService  = inject(PostService);
  auth         = inject(AuthService);
  firestore    = inject(Firestore);
  savedService = inject(SavedService);
  private route  = inject(ActivatedRoute);
  private router = inject(Router);

  reels: Reel[] = [];

  selectedFile: File | null = null;
  description  = '';
  isUploading  = false;
  uploadProgress: number | null = null;   // ← progreso Cloudinary

  // ─── Reacciones post ───────────────────────────────────────────
  reactionMenuVisible  = false;
  reactionMenuReelId: string | null = null;
  reactionMenuPos      = { left: 0, top: 0 };
  private holdTimer: any;
  private holdTargetReel: Reel | null = null;
  private localReactions: Record<string, Record<string, ReactionType>> = {};

  // ─── Comentarios ───────────────────────────────────────────────
  commentsMap: Record<string, CommentItem[]> = {};
  draftComments: Record<string, string>      = {};
  openCommentsFor: string | null             = null;
  repliesMap: Record<string, any[]>          = {};
  activeReplyCommentId: string | null        = null;
  replyDrafts: Record<string, string>        = {};
  editingCommentId: string | null            = null;
  editCommentDraft = '';

  // ─── Reacciones en comentarios ─────────────────────────────────
  commentReactionMenuId: string | null       = null;
  private commentHoldTimer: any;
  private readonly commentHoldTimeout        = 450;

  // ─── Modales ───────────────────────────────────────────────────
  showReactionsModal        = false;
  reactionsList: any[]      = [];
  showCommentReactionsModal = false;
  commentReactionsList: any[] = [];

  // ─── Modal Repost ───────────────────────────────────────────────
  showRepostModal       = false;
  repostTargetReel: Reel | null = null;
  repostDescription     = '';
  repostTags: string[]  = [];

  // ─── Menciones tipo Facebook ────────────────────────────────────
  mentionResults: { uid: string; userName: string; avatar: string }[] = [];
  mentionActive = false;
  private mentionTimeout: any;

  // ─── Toast ─────────────────────────────────────────────────────
  toastMessage: string | null = null;

  // ─── Target desde búsqueda ─────────────────────────────────────
  targetReelId: string | null = null;

  currentUid: string | null = null;

  readonly reactionList: { type: ReactionType; label: string; emoji: string }[] = [
    { type: 'like',  label: 'Me gusta',     emoji: '👍' },
    { type: 'love',  label: 'Me encanta',   emoji: '❤️' },
    { type: 'haha',  label: 'Me divierte',  emoji: '😂' },
    { type: 'sad',   label: 'Me entristece',emoji: '😢' },
    { type: 'angry', label: 'Me enoja',     emoji: '😡' },
  ];

  constructor() {
    this.auth.user$.subscribe(u => this.currentUid = u?.uid ?? null);

    this.route.queryParams.subscribe(params => {
      this.targetReelId = params['reelId'] || null;
    });

    this.postService.getReelsFirestore().subscribe(async reelsObs => {
      const filtered = reelsObs.filter((r: any) => !r.isRepost);

      for (const r of filtered) {
        const existing = this.reels.find(x => x.id === r.id);

        if (existing) {
          existing.likes         = r.likes        || 0;
          existing.commentsCount = r.commentsCount || 0;
        } else {
          const newReel: Reel = {
            id:            r.id,
            videoUrl:      r.videoUrl,
            description:   r.description,
            uid:           r.uid,
            userName:      r.userName,
            avatarUrl:     r.avatarUrl,
            createdAt:     r.createdAt,
            likes:         r.likes        || 0,
            commentsCount: r.commentsCount || 0,
            showComments:  false,
            userReaction:  null,
          };
          this.reels.push(newReel);
          await this.loadUserReaction(newReel);
        }
      }

      this.reels = this.reels.filter(r => filtered.some((x: any) => x.id === r.id));
    });
  }

  // ─── AfterViewInit: scroll automático ──────────────────────────
  ngAfterViewInit() {
    this.route.queryParams.subscribe(params => {
      const reelId = params['reelId'];
      if (!reelId) return;

      const interval = setInterval(() => {
        const el = document.getElementById(reelId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.style.boxShadow = '0 0 0 3px #1877f2';
          setTimeout(() => el.style.boxShadow = '', 2000);
          clearInterval(interval);
        }
      }, 200);
    });
  }

  // ─── Upload ────────────────────────────────────────────────────
  onFileSelected(e: any) {
    this.selectedFile = e.target.files?.[0] || null;
  }

  private async getUserAvatar(uid: string): Promise<string> {
    try {
      const snap = await getDoc(doc(this.firestore, `users/${uid}`));
      if (snap.exists()) return (snap.data() as any)?.avatar || '';
    } catch { }
    return '';
  }

  async publishReel() {
    const user = await firstValueFrom(this.auth.user$);
    if (!user || !this.selectedFile) return;

    this.isUploading    = true;
    this.uploadProgress = 0;

    const avatar = (await this.getUserAvatar(user.uid)) || user.photoURL || '';

    this.postService.uploadVideo(this.selectedFile, {
      uid:         user.uid,
      userName:    user.displayName || 'Usuario',
      description: this.description || '',
      avatarUrl:   avatar,
    }).subscribe({
      next: (event: { progress?: number; reel?: any }) => {
        if (event.progress !== undefined) {
          this.uploadProgress = event.progress;
        }
        if (event.reel) {
          this.description    = '';
          this.selectedFile   = null;
          this.isUploading    = false;
          this.uploadProgress = null;
          this.showToast('Reel publicado ✔');
        }
      },
      error: (err: any) => {
        console.error('Error subiendo reel:', err);
        this.isUploading    = false;
        this.uploadProgress = null;
        this.showToast('❌ Error al subir el reel');
      }
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  REACCIONES
  // ══════════════════════════════════════════════════════════════

  startHold(reel: Reel, evt: MouseEvent | TouchEvent) {
    let x = 0, y = 0;
    if (evt instanceof TouchEvent) { x = evt.touches[0].clientX; y = evt.touches[0].clientY; }
    else { x = evt.clientX; y = evt.clientY; }

    this.holdTargetReel = reel;
    this.holdTimer = setTimeout(() => this.openReactionMenu(reel, x, y), 450);
  }

  endHold(reel: Reel) {
    if (this.holdTimer) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
      this.toggleQuickLike(reel);
    }
  }

  cancelHold() {
    if (this.holdTimer) { clearTimeout(this.holdTimer); this.holdTimer = null; }
  }

  openReactionMenu(reel: Reel, x: number, y: number) {
    this.reactionMenuReelId  = reel.id!;
    this.reactionMenuVisible = true;
    this.reactionMenuPos     = { left: x - 120, top: y - 80 };
  }

  closeReactionMenu() {
    this.reactionMenuVisible = false;
    this.reactionMenuReelId  = null;
  }

  async toggleQuickLike(reel: Reel) {
    const user = await firstValueFrom(this.auth.user$);
    if (!user) return;
    const prev = this.getLocalReaction(reel.id!, user.uid);
    await this.applyReaction(reel, prev ? null : 'like');
  }

  async selectReaction(reel: Reel, type: ReactionType) {
    await this.applyReaction(reel, type);
    this.closeReactionMenu();
  }

  private async applyReaction(reel: Reel, reaction: ReactionType | null) {
    const user = await firstValueFrom(this.auth.user$);
    if (!user) return;

    const uid    = user.uid;
    const ref    = doc(this.firestore, `reels/${reel.id!}/reactions/${uid}`);
    const col    = collection(this.firestore, `reels/${reel.id!}/reactions`);
    const prev   = this.getLocalReaction(reel.id!, uid);
    const avatar = (await this.getUserAvatar(uid)) || user.photoURL || '';

    this.setLocalReaction(reel.id!, uid, reaction);
    if (reaction === null && prev) reel.likes = Math.max(0, (reel.likes || 0) - 1);
    else if (reaction !== null && !prev) reel.likes = (reel.likes || 0) + 1;

    try {
      if (reaction === null) {
        if ((await getDoc(ref)).exists()) await deleteDoc(ref);
      } else {
        await setDoc(ref, {
          type: reaction, userId: uid,
          userName: user.displayName || 'Usuario',
          userAvatar: avatar, createdAt: serverTimestamp(),
        });
      }

      const all   = await getDocs(col);
      reel.likes  = all.size;

      await updateDoc(doc(this.firestore, `reels/${reel.id!}`), { likes: reel.likes });

      const temp: Record<string, ReactionType> = {};
      all.forEach(d => temp[d.id] = d.data()['type']);
      this.localReactions[reel.id!] = temp;
    } catch (err) { console.error(err); }
  }

  getLocalReaction(reelId: string, uid: string): ReactionType | null {
    return this.localReactions[reelId]?.[uid] ?? null;
  }

  setLocalReaction(reelId: string, uid: string, type: ReactionType | null) {
    if (!this.localReactions[reelId]) this.localReactions[reelId] = {};
    if (type) this.localReactions[reelId][uid] = type;
    else delete this.localReactions[reelId][uid];
  }

  getReactionEmoji(type: ReactionType | null | undefined): string {
    switch (type) {
      case 'love':  return '❤️';
      case 'haha':  return '😂';
      case 'sad':   return '😢';
      case 'angry': return '😡';
      default:      return '👍';
    }
  }

  getReactionLabel(type: ReactionType | null | undefined): string {
    switch (type) {
      case 'like':  return 'Me gusta';
      case 'love':  return 'Me encanta';
      case 'haha':  return 'Me divierte';
      case 'sad':   return 'Me entristece';
      case 'angry': return 'Me enoja';
      default:      return 'Me gusta';
    }
  }

  getReactionClass(reelId: string, uid?: string | null): string {
    if (!uid) return 'reaction-none';
    switch (this.getLocalReaction(reelId, uid)) {
      case 'like':  return 'reaction-like';
      case 'love':  return 'reaction-love';
      case 'haha':  return 'reaction-haha';
      case 'sad':   return 'reaction-sad';
      case 'angry': return 'reaction-angry';
      default:      return 'reaction-none';
    }
  }

  async loadUserReaction(reel: Reel) {
    const user = await firstValueFrom(this.auth.user$);
    if (!user) return;
    const snap = await getDoc(doc(this.firestore, `reels/${reel.id!}/reactions/${user.uid}`));
    if (snap.exists()) {
      const type       = snap.data()?.['type'] as ReactionType;
      reel.userReaction = type;
      this.setLocalReaction(reel.id!, user.uid, type);
    }
  }

  async showReactions(reelId: string) {
    const snap = await getDocs(collection(this.firestore, `reels/${reelId}/reactions`));
    this.reactionsList = snap.docs.map(d => ({
      userId: d.data()['userId'], userName: d.data()['userName'],
      userAvatar: d.data()['userAvatar'], type: d.data()['type'],
    }));
    this.showReactionsModal = true;
  }

  // ══════════════════════════════════════════════════════════════
  //  COMENTARIOS
  // ══════════════════════════════════════════════════════════════

  async openComments(reel: Reel) {
    this.openCommentsFor = reel.id!;
    await this.loadComments(reel.id!);
  }

  async loadComments(reelId: string) {
    try {
      const uid = this.currentUid;
      const q   = query(
        collection(this.firestore, `reels/${reelId}/comments`),
        orderBy('createdAt', 'asc')
      );
      const snap = await getDocs(q);
      const commentItems: CommentItem[] = [];

      for (const d of snap.docs) {
        const cid           = d.id;
        const reactionsSnap = await getDocs(
          collection(this.firestore, `reels/${reelId}/comments/${cid}/reactions`)
        );
        let userReaction: ReactionType | undefined;
        if (uid) {
          const mine = reactionsSnap.docs.find(r => r.id === uid);
          if (mine) userReaction = mine.data()['type'] as ReactionType;
        }
        commentItems.push({
          id:             cid,
          userId:         d.data()['userId'],
          userName:       d.data()['userName'],
          userAvatar:     d.data()['userAvatar'] || '',
          text:           d.data()['text'],
          createdAt:      d.data()['createdAt'] instanceof Timestamp
                            ? d.data()['createdAt'].toDate() : new Date(),
          userReaction,
          reactionsCount: reactionsSnap.size,
        });
      }

      this.commentsMap[reelId] = commentItems;
      for (const c of commentItems) {
        if (c.id) await this.loadReplies(reelId, c.id);
      }
    } catch (err) {
      console.error('Error cargando comentarios', err);
      this.commentsMap[reelId] = [];
    }
  }

  async addComment(reel: Reel, text: string) {
    if (!text?.trim()) return;
    const user = await firstValueFrom(this.auth.user$);
    if (!user) return;

    const avatar = (await this.getUserAvatar(user.uid)) || user.photoURL || '';

    await addDoc(collection(this.firestore, `reels/${reel.id!}/comments`), {
      userId: user.uid, userName: user.displayName || 'Usuario',
      userAvatar: avatar, text: text.trim(), createdAt: serverTimestamp(),
    });

    await updateDoc(doc(this.firestore, `reels/${reel.id!}`), { commentsCount: increment(1) });
    reel.commentsCount        = (reel.commentsCount || 0) + 1;
    this.draftComments[reel.id!] = '';
    await this.loadComments(reel.id!);
    this.showToast('Comentario agregado');
  }

  async loadReplies(reelId: string, commentId: string) {
    const q    = query(
      collection(this.firestore, `reels/${reelId}/comments/${commentId}/replies`),
      orderBy('createdAt', 'asc')
    );
    const snap = await getDocs(q);
    this.repliesMap[commentId] = snap.docs.map(d => ({
      id:         d.id,
      userId:     d.data()['userId'],
      userName:   d.data()['userName'],
      userAvatar: d.data()['userAvatar'] || '',
      text:       d.data()['text'],
      createdAt:  d.data()['createdAt']?.toDate?.() || new Date(),
    }));
  }

  async replyToComment(reel: Reel, comment: CommentItem) {
    const text = this.replyDrafts[comment.id!];
    if (!text?.trim()) return;
    const user = await firstValueFrom(this.auth.user$);
    if (!user) return;

    const avatar = (await this.getUserAvatar(user.uid)) || user.photoURL || '';

    await addDoc(
      collection(this.firestore, `reels/${reel.id!}/comments/${comment.id}/replies`),
      {
        userId: user.uid, userName: user.displayName || 'Usuario',
        userAvatar: avatar, text: text.trim(), createdAt: serverTimestamp(),
      }
    );
    this.replyDrafts[comment.id!]  = '';
    this.activeReplyCommentId       = null;
    await this.loadReplies(reel.id!, comment.id!);
  }

  async deleteReply(reel: Reel, comment: CommentItem, reply: any) {
    const user = await firstValueFrom(this.auth.user$);
    if (!user || user.uid !== reply.userId) return;
    await deleteDoc(doc(this.firestore, `reels/${reel.id!}/comments/${comment.id}/replies/${reply.id}`));
    if (this.repliesMap[comment.id!])
      this.repliesMap[comment.id!] = this.repliesMap[comment.id!].filter(r => r.id !== reply.id);
    this.showToast('Respuesta eliminada');
  }

  startEditComment(comment: CommentItem) {
    this.editingCommentId = comment.id!;
    this.editCommentDraft = comment.text;
  }

  cancelEditComment() {
    this.editingCommentId = null;
    this.editCommentDraft = '';
  }

  async saveEditComment(reel: Reel, comment: CommentItem) {
    if (!this.editCommentDraft.trim()) return;
    await updateDoc(
      doc(this.firestore, `reels/${reel.id!}/comments/${comment.id}`),
      { text: this.editCommentDraft, updatedAt: serverTimestamp() }
    );
    comment.text = this.editCommentDraft;
    this.cancelEditComment();
  }

  async confirmDeleteComment(reel: Reel, comment: CommentItem) {
    if (!confirm('¿Seguro que deseas eliminar este comentario?')) return;
    await deleteDoc(doc(this.firestore, `reels/${reel.id!}/comments/${comment.id}`));
    await updateDoc(doc(this.firestore, `reels/${reel.id!}`), { commentsCount: increment(-1) });
    reel.commentsCount = Math.max(0, (reel.commentsCount || 0) - 1);
    await this.loadComments(reel.id!);
    this.showToast('Comentario eliminado');
  }

  // ── Reacciones en comentarios ──────────────────────────────────

  startCommentHold(reel: Reel, c: CommentItem, _evt: any) {
    this.commentHoldTimer = setTimeout(() => {
      this.commentReactionMenuId = c.id ?? null;
    }, this.commentHoldTimeout);
  }

  endCommentHold(reel: Reel, c: CommentItem) {
    if (this.commentHoldTimer) {
      clearTimeout(this.commentHoldTimer);
      this.commentHoldTimer = null;
      this.toggleQuickCommentReaction(reel, c);
    }
  }

  cancelCommentHold() {
    if (this.commentHoldTimer) { clearTimeout(this.commentHoldTimer); this.commentHoldTimer = null; }
  }

  async toggleQuickCommentReaction(reel: Reel, c: CommentItem) {
    const user = await firstValueFrom(this.auth.user$);
    if (!user) return;
    const ref = doc(this.firestore, `reels/${reel.id!}/comments/${c.id}/reactions/${user.uid}`);
    if (c.userReaction) {
      c.userReaction  = undefined;
      c.reactionsCount = Math.max(0, (c.reactionsCount || 1) - 1);
      await deleteDoc(ref);
    } else {
      c.userReaction  = 'like';
      c.reactionsCount = (c.reactionsCount || 0) + 1;
      const avatar     = (await this.getUserAvatar(user.uid)) || user.photoURL || '';
      await setDoc(ref, {
        type: 'like', userId: user.uid,
        userName: user.displayName || 'Usuario',
        userAvatar: avatar, createdAt: serverTimestamp(),
      });
    }
  }

  async selectCommentReaction(reel: Reel, c: CommentItem, type: string) {
    const user = await firstValueFrom(this.auth.user$);
    if (!user) return;
    const ref  = doc(this.firestore, `reels/${reel.id!}/comments/${c.id}/reactions/${user.uid}`);
    const prev = c.userReaction;
    if (prev === type) {
      c.userReaction  = undefined;
      c.reactionsCount = Math.max(0, (c.reactionsCount || 1) - 1);
      await deleteDoc(ref);
    } else {
      c.userReaction = type as ReactionType;
      if (!prev) c.reactionsCount = (c.reactionsCount || 0) + 1;
      const avatar = (await this.getUserAvatar(user.uid)) || user.photoURL || '';
      await setDoc(ref, {
        type, userId: user.uid,
        userName: user.displayName || 'Usuario',
        userAvatar: avatar, createdAt: serverTimestamp(),
      });
    }
    this.commentReactionMenuId = null;
  }

  async showCommentReactions(reelId: string, comment: CommentItem) {
    if (!comment.id) return;
    const snap = await getDocs(
      collection(this.firestore, `reels/${reelId}/comments/${comment.id}/reactions`)
    );
    this.commentReactionsList = snap.docs.map(d => ({
      userId: d.data()['userId'], userName: d.data()['userName'],
      userAvatar: d.data()['userAvatar'], type: d.data()['type'],
    }));
    this.showCommentReactionsModal = true;
  }

  // ══════════════════════════════════════════════════════════════
  //  GUARDAR REEL
  // ══════════════════════════════════════════════════════════════

  async saveReel(reel: Reel) {
    try {
      const result = await this.savedService.toggleSave(reel.id!, 'reel', {
        content:       reel.description  || '',
        description:   reel.description  || '',
        videoUrl:      reel.videoUrl     || '',
        userName:      reel.userName     || '',
        avatarUrl:     reel.avatarUrl    || '',
        uid:           reel.uid,
        likes:         reel.likes        || 0,
        commentsCount: reel.commentsCount || 0,
      });
      this.showToast(result.saved ? '🔖 Reel guardado' : '🗑 Eliminado de guardados');
    } catch (err) {
      console.error(err);
      this.showToast('❌ Error al guardar');
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  REPOST
  // ══════════════════════════════════════════════════════════════

  openRepostModal(reel: Reel) {
    this.repostTargetReel = reel;
    this.repostDescription = '';
    this.repostTags        = [];
    this.mentionResults    = [];
    this.mentionActive     = false;
    this.showRepostModal   = true;
  }

  onDescriptionInput(event: Event) {
    const val = (event.target as HTMLTextAreaElement).value;
    this.repostDescription = val;

    const match = val.match(/@(\w*)$/);
    if (match) {
      this.mentionActive = true;
      clearTimeout(this.mentionTimeout);
      this.mentionTimeout = setTimeout(() => this.searchUsers(match[1]), 300);
    } else {
      this.mentionActive  = false;
      this.mentionResults = [];
    }
  }

  async searchUsers(queryStr: string) {
    try {
      const snap = await getDocs(collection(this.firestore, 'users'));
      this.mentionResults = snap.docs
        .map(d => ({
          uid:      d.id,
          userName: (d.data() as any).displayName || (d.data() as any).userName || '',
          avatar:   (d.data() as any).avatar      || (d.data() as any).photoURL  || '',
        }))
        .filter(u =>
          u.userName &&
          u.userName.toLowerCase().includes(queryStr.toLowerCase()) &&
          u.uid !== this.currentUid
        )
        .slice(0, 6);
    } catch (err) {
      console.error(err);
      this.mentionResults = [];
    }
  }

  onCommentInput(event: Event, reelId: string) {
    const val = (event.target as HTMLTextAreaElement).value;
    this.draftComments[reelId] = val;
    const match = val.match(/@(\w*)$/);
    if (match) {
      this.mentionActive = true;
      clearTimeout(this.mentionTimeout);
      this.mentionTimeout = setTimeout(() => this.searchUsers(match[1]), 300);
    } else {
      this.mentionActive  = false;
      this.mentionResults = [];
    }
  }

  selectMentionComment(user: { uid: string; userName: string }, reelId: string) {
    const tagName = user.userName.split(' ')[0];
    this.draftComments[reelId] = (this.draftComments[reelId] || '').replace(/@(\w*)$/, `@${tagName} `);
    this.mentionActive  = false;
    this.mentionResults = [];
  }

  selectMention(user: { uid: string; userName: string }) {
    const tagName = user.userName.split(' ')[0];
    this.repostDescription = this.repostDescription
      ? this.repostDescription.replace(/@(\w*)$/, `@${tagName} `)
      : this.description.replace(/@(\w*)$/, `@${tagName} `);
    this.description = this.description.replace(/@(\w*)$/, `@${tagName} `);
    if (!this.repostTags.includes(user.userName)) this.repostTags.push(user.userName);
    this.mentionActive  = false;
    this.mentionResults = [];
  }

  removeRepostTag(tag: string) {
    this.repostTags = this.repostTags.filter(t => t !== tag);
  }

  getDescriptionWithMentions(description: string): { text: string; isMention: boolean; userName: string }[] {
    if (!description) return [];
    const parts = description.split(/(@\w+)/g);
    return parts.map(part => ({
      text:      part,
      isMention: /^@\w+/.test(part),
      userName:  part.replace('@', ''),
    }));
  }

  async goToMentionedUser(userName: string) {
    try {
      const snap        = await getDocs(collection(this.firestore, 'users'));
      const lowerTarget = userName.toLowerCase();

      const found = snap.docs.find(d => {
        const data     = d.data() as any;
        const fullName = (data.displayName || data.userName || '').toLowerCase();
        return fullName.startsWith(lowerTarget) || lowerTarget.startsWith(fullName);
      });

      if (!found) { console.warn('Usuario no encontrado:', userName); return; }

      const user = await firstValueFrom(this.auth.user$);
      const path = found.id === user?.uid ? '/profile' : `/user/${found.id}`;
      this.router.navigateByUrl(path);
    } catch (err) { console.error(err); }
  }

  async confirmRepost() {
    const reel = this.repostTargetReel;
    const user = await firstValueFrom(this.auth.user$);
    if (!reel || !user) return;

    await this.postService.repostReelToFeed(reel, user, {
      description: this.repostDescription,
      tags:        this.repostTags,
    });

    reel.repostsCount  = (reel.repostsCount || 0) + 1;
    this.showRepostModal    = false;
    this.repostTargetReel   = null;
    this.showToast('🔁 Reel reposteado');
  }

  // ══════════════════════════════════════════════════════════════
  //  ELIMINAR
  // ══════════════════════════════════════════════════════════════

  async deleteReel(reel: Reel) {
    const user = await firstValueFrom(this.auth.user$);
    if (!user || user.uid !== reel.uid) return;
    if (!confirm('¿Eliminar este reel?')) return;
    await this.postService.deleteReel(reel.id!);
    this.reels = this.reels.filter(r => r.id !== reel.id!);
    this.showToast('Reel eliminado');
  }

  // ── Navegación ─────────────────────────────────────────────────

  async goToProfile(userId?: string) {
    if (!userId?.trim()) return;
    const user = await firstValueFrom(this.auth.user$);
    this.router.navigateByUrl(userId === user?.uid ? '/profile' : `/user/${userId}`);
  }

  // ── Toast ──────────────────────────────────────────────────────

  showToast(msg: string) {
    this.toastMessage = msg;
    setTimeout(() => this.toastMessage = null, 2500);
  }
}