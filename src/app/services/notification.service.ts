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
    authState(this.auth).subscribe(async user => {
      this._sub?.unsubscribe();
      if (!user) {
        this.notifications.set([]);
        return;
      }
      try {
        await user.getIdToken();
      } catch {
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

  // ── Atajos por tipo ────────────────────────────────────────────────────────
  notifyComment(p: { toUid: string; fromUid: string; fromName: string; fromAvatar: string; postId: string; text: string }): Promise<void> {
    return this.createNotification({ ...p, type: 'comment' });
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

  notifyMention(p: { toUid: string; fromUid: string; fromName: string; fromAvatar: string; postId: string }): Promise<void> {
    return this.createNotification({ ...p, type: 'mention' });
  }
}