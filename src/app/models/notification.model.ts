import { Timestamp } from '@angular/fire/firestore';

export type NotificationType =
  | 'comment'
  | 'reaction'
  | 'friend_request'
  | 'friend_accepted'
  | 'new_post'
  | 'mention'
  | 'reply'
  | 'repost'
  | 'message';

export interface AppNotification {
  id?: string;
  toUid: string;
  fromUid: string;
  fromName: string;
  fromAvatar?: string;
  type: NotificationType;
  postId?: string;
  chatId?: string;
  friendRequestId?: string;
  text?: string;
  reelId?: string;
  read: boolean;
  createdAt: Timestamp | Date;
}

/** Payload para crear una notificación (sin id, read ni createdAt) */
export interface NotificationPayload {
  toUid: string;
  fromUid: string;
  fromName: string;
  fromAvatar?: string;
  type: NotificationType;
  postId?: string;
  chatId?: string;
  friendRequestId?: string;
  text?: string;
  reelId?: string;
}