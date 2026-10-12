import { Injectable, inject, signal, computed } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  serverTimestamp,
  collectionData,
  doc,
  updateDoc,
  query,
  orderBy,
  writeBatch,
  getDocs,
  where
} from '@angular/fire/firestore';
import { Auth, authState } from '@angular/fire/auth';
import { Subscription } from 'rxjs';
import { AppNotification, NotificationPayload } from '../models/notification.model';
import { PushService } from './push.service';   // ← NUEVO

@Injectable({ providedIn: 'root' })
export class NotificationService {

  private firestore = inject(Firestore);
  private auth      = inject(Auth);
  private pushService = inject(PushService);      // ← NUEVO

  readonly notifications = signal<AppNotification[]>([]);
  readonly unreadCount   = computed(() =>
    this.notifications().filter(n => !n.read).length
  );

  private _sub: Subscription | null = null;

  constructor() {
    authState(this.auth).subscribe(user => {
      this._sub?.unsubscribe();
      if (!user) {
        this.notifications.set([]);
        return;
      }
      this._listen(user.uid);
    });
  }

  private _listen(uid: string): void {
    const ref = query(
      collection(this.firestore, `users/${uid}/notifications`),
      orderBy('createdAt', 'desc')
    );
    this._sub = (collectionData(ref, { idField: 'id' }) as any).subscribe(
      (data: AppNotification[]) => this.notifications.set(data)
    );
  }

  async createNotification(payload: NotificationPayload): Promise<void> {
    if (payload.toUid === payload.fromUid) return;

    // NUEVO: guardamos la referencia que devuelve addDoc, para tener el
    // id recién creado y poder disparar el push justo después.
    const notifRef = await addDoc(
      collection(this.firestore, `users/${payload.toUid}/notifications`),
      {
        toUid:           payload.toUid,
        fromUid:         payload.fromUid,
        fromName:        payload.fromName,
        fromAvatar:      payload.fromAvatar  ?? '',
        type:            payload.type,
        postId:          payload.postId          ?? null,
        chatId:          payload.chatId          ?? null,
        friendRequestId: payload.friendRequestId ?? null,
        commentId:       payload.commentId       ?? null,
        text:            payload.text            ?? null,
        reelId:          payload.reelId          ?? null,
        read:      false,
        createdAt: serverTimestamp()
      }
    );

    // NUEVO: dispara el push real (no bloquea ni rompe el flujo si falla —
    // triggerPush ya atrapa sus propios errores internamente).
    this.pushService.triggerPush(payload.toUid, notifRef.id);
  }

  async markRead(toUid: string, notifId: string): Promise<void> {
    await updateDoc(
      doc(this.firestore, `users/${toUid}/notifications/${notifId}`),
      { read: true }
    );
  }

  async markAllRead(toUid: string): Promise<void> {
    const ref   = query(
      collection(this.firestore, `users/${toUid}/notifications`),
      where('read', '==', false)
    );
    const snap  = await getDocs(ref);
    const batch = writeBatch(this.firestore);
    snap.docs.forEach(d => batch.update(d.ref, { read: true }));
    await batch.commit();
  }

  async markFriendRequestProcessed(toUid: string, friendRequestId: string): Promise<void> {
    const ref = query(
      collection(this.firestore, `users/${toUid}/notifications`),
      where('friendRequestId', '==', friendRequestId)
    );
    const snap = await getDocs(ref);
    if (snap.empty) return;

    const batch = writeBatch(this.firestore);
    snap.docs.forEach(d => batch.update(d.ref, { read: true, processed: true }));
    await batch.commit();
  }

  // ── Atajos por tipo ────────────────────────────────────────────────────────
  notifyComment(p: { toUid: string; fromUid: string; fromName: string; fromAvatar: string; postId: string; text: string }): Promise<void> {
    return this.createNotification({ ...p, type: 'comment' });
  }

  notifyReelComment(p: { toUid: string; fromUid: string; fromName: string; fromAvatar: string; reelId: string; text: string }): Promise<void> {
    return this.createNotification({ ...p, type: 'comment' });
  }

  notifyCommentReaction(p: { toUid: string; fromUid: string; fromName: string; fromAvatar: string; commentId: string; postId?: string; reelId?: string }): Promise<void> {
    return this.createNotification({ ...p, type: 'comment_reaction' });
  }

  notifyReaction(p: { toUid: string; fromUid: string; fromName: string; fromAvatar: string; postId: string }): Promise<void> {
    return this.createNotification({ ...p, type: 'reaction' });
  }

  notifyFriendRequest(p: { toUid: string; fromUid: string; fromName: string; fromAvatar: string; friendRequestId: string }): Promise<void> {
    return this.createNotification({ ...p, type: 'friend_request' });
  }

  notifyFriendAccepted(p: { toUid: string; fromUid: string; fromName: string; fromAvatar: string }): Promise<void> {
    return this.createNotification({ ...p, type: 'friend_accepted' });
  }

  notifyNewPost(p: { toUid: string; fromUid: string; fromName: string; fromAvatar: string; postId: string; text?: string }): Promise<void> {
    return this.createNotification({ ...p, type: 'new_post' });
  }

  notifyMessage(p: { toUid: string; fromUid: string; fromName: string; fromAvatar: string; chatId: string; text: string }): Promise<void> {
    return this.createNotification({ ...p, type: 'message' });
  }

  notifyReply(p: { toUid: string; fromUid: string; fromName: string; fromAvatar: string; postId: string; text: string }): Promise<void> {
    return this.createNotification({ ...p, type: 'reply' });
  }

  notifyReelReply(p: { toUid: string; fromUid: string; fromName: string; fromAvatar: string; reelId: string; text: string }): Promise<void> {
    return this.createNotification({ ...p, type: 'reply' });
  }

  notifyMention(p: { toUid: string; fromUid: string; fromName: string; fromAvatar: string; postId: string }): Promise<void> {
    return this.createNotification({ ...p, type: 'mention' });
  }

  async notifyMentionedUsers(p: {
    users: { uid: string; userName: string }[];
    fromUid: string;
    fromName: string;
    fromAvatar: string;
    text: string;
    postId?: string;
    reelId?: string;
  }): Promise<void> {
    const normalizedText = p.text.toLocaleLowerCase();
    const targets = p.users.filter(user =>
      user.uid !== p.fromUid &&
      normalizedText.includes(`@${user.userName.split(' ')[0].toLocaleLowerCase()}`)
    );

    await Promise.all(targets.map(user => this.createNotification({
      toUid: user.uid,
      fromUid: p.fromUid,
      fromName: p.fromName,
      fromAvatar: p.fromAvatar,
      type: 'mention',
      postId: p.postId,
      reelId: p.reelId,
      text: p.text.trim().slice(0, 100)
    })));
  }

  notifyRepost(p: { toUid: string; fromUid: string; fromName: string; fromAvatar: string; postId?: string; reelId?: string }): Promise<void> {
    return this.createNotification({ ...p, type: 'repost' });
  }
}