import { Timestamp } from '@angular/fire/firestore';

export interface Post {

  id?: string;

  type: 'post' | 'reel' | 'repost';

  content: string;

  imageUrl?: string;

  videoUrl?: string;

  tags?: string[];

  userId: string;

  userName: string;

  userAvatar?: string;

  createdAt: Timestamp;

  likesCount: number;

  commentsCount: number;

  repostsCount: number;

  originalPostId?: string;

  originalType?: string;

  originalAuthorId?: string;

  originalAuthorName?: string;

  originalAuthorAvatar?: string;

  repostedById?: string;

  repostedByName?: string;

  repostDate?: Timestamp;

  reelId?: string;
}