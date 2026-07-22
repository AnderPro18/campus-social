import { Component, inject, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Firestore, doc, updateDoc } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { NotificationService } from '../../services/notification.service';
import { AppNotification, NotificationType } from '../../models/notification.model';

@Component({
  selector: 'app-notifications-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notifications-panel.component.html',
  styleUrls: ['./notifications-panel.component.scss']
})
export class NotificationsPanelComponent {

  @Output() close = new EventEmitter<void>();

  private router    = inject(Router);
  private auth      = inject(Auth);
  private firestore = inject(Firestore);
  readonly ns       = inject(NotificationService);

  get notifications(): AppNotification[] { return this.ns.notifications(); }

  getLabel(type: NotificationType): string {
    const labels: Record<NotificationType, string> = {
      comment:         'comentó tu publicación',
      reaction:        'reaccionó a tu publicación',
      friend_request:  'te envió una solicitud de amistad',
      friend_accepted: 'aceptó tu solicitud de amistad',
      new_post:        'hizo una nueva publicación',
      mention:         'te mencionó en una publicación',
      reply:           'respondió a tu comentario',
      repost:          'compartió tu publicación',
      message:         'te envió un mensaje',
    };
    return labels[type] ?? 'interactuó contigo';
  }

  getIcon(type: NotificationType): string {
    const icons: Record<NotificationType, string> = {
      comment:         'bi-chat-left-text',
      reaction:        'bi-heart',
      friend_request:  'bi-person-plus',
      friend_accepted: 'bi-person-check',
      new_post:        'bi-file-post',
      mention:         'bi-at',
      reply:           'bi-reply',
      repost:          'bi-repeat',
      message:         'bi-envelope',
    };
    return icons[type] ?? 'bi-bell';
  }

  hasFriendAction(n: AppNotification): boolean {
    return n.type === 'friend_request' && !!n.friendRequestId;
  }

  isProcessed(n: AppNotification & { processed?: boolean }): boolean {
    return !!n['processed'];
  }

  async openNotification(n: AppNotification): Promise<void> {
    const uid = this.auth.currentUser?.uid;
    if (!uid || !n.id) return;

    if (!n.read) await this.ns.markRead(uid, n.id);
    this.close.emit();

    switch (n.type) {
      case 'comment':
      case 'reaction':
      case 'new_post':
      case 'mention':
      case 'repost':
      case 'reply':
        if (n.postId) this.router.navigate(['/post', n.postId]);
        break;
      case 'message':
        this.router.navigate(['/chat']);
        break;
      case 'friend_request':
      case 'friend_accepted':
        this.router.navigate(['/friends']);
        break;
    }
  }

  async acceptFriendRequest(n: AppNotification, event: Event): Promise<void> {
    event.stopPropagation();
    if (!n.friendRequestId) return;

    const me  = this.auth.currentUser;
    const uid = me?.uid;

    await updateDoc(
      doc(this.firestore, `friendRequests/${n.friendRequestId}`),
      { status: 'accepted' }
    );

    if (uid) {
      await this.ns.notifyFriendAccepted({
        toUid:      n.fromUid,
        fromUid:    uid,
        fromName:   me?.displayName ?? 'Usuario',
        fromAvatar: me?.photoURL    ?? ''
      });
    }

    if (uid && n.id) {
      await updateDoc(
        doc(this.firestore, `users/${uid}/notifications/${n.id}`),
        { read: true, processed: true }
      );
    }
  }

  async rejectFriendRequest(n: AppNotification, event: Event): Promise<void> {
    event.stopPropagation();
    if (!n.friendRequestId) return;

    const uid = this.auth.currentUser?.uid;

    await updateDoc(
      doc(this.firestore, `friendRequests/${n.friendRequestId}`),
      { status: 'rejected' }
    );

    if (uid && n.id) {
      await updateDoc(
        doc(this.firestore, `users/${uid}/notifications/${n.id}`),
        { read: true, processed: true }
      );
    }
  }

  async markAllRead(): Promise<void> {
    const uid = this.auth.currentUser?.uid;
    if (uid) await this.ns.markAllRead(uid);
  }

  timeAgo(n: AppNotification): string {
    if (!n.createdAt) return '';
    const ts   = n.createdAt as any;
    const date: Date = ts?.toDate ? ts.toDate() : new Date(ts);
    const diff = (Date.now() - date.getTime()) / 1000;

    if (diff < 60)    return 'ahora';
    if (diff < 3600)  return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  }
}