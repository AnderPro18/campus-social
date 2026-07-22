import { Timestamp } from '@angular/fire/firestore';

export interface CommentModel {

  id?: string;

  userId: string;

  userName: string;

  userAvatar?: string;

  content: string;

  reactionsCount?: number;

  repliesCount?: number;

  createdAt?: Timestamp;
}