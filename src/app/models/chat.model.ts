export interface Chat {
  id: string;
  type: 'dm' | 'group';
  members: string[];
  memberProfiles?: { [uid: string]: { displayName: string; photoURL: string } };
  lastMessage?: string;
  lastUpdated?: any;
  createdAt?: any;
  groupName?: string;
  groupPhoto?: string;
  adminUid?: string;
  unreadCount?: number;
}

export interface ViewOnceMedia {
  viewed: boolean;
  viewedBy?: string[];
}

export interface Message {
  id?: string;
  senderId: string;
  senderName?: string;
  senderPhoto?: string;
  text?: string;
  imageURL?: string;
  fileURL?: string;
  fileName?: string;
  fileSize?: number;
  audioURL?: string;
  audioDuration?: number;
  gifURL?: string;         // URL del GIF (Giphy)
  stickerURL?: string;     // URL del sticker
  location?: {
    lat: number;
    lng: number;
    address?: string;
  };
  type: 'text' | 'image' | 'file' | 'audio' | 'emoji' | 'gif' | 'sticker' | 'location';
  createdAt: any;
  readBy?: string[];
  replyTo?: {
    messageId: string;
    text: string;
    senderName: string;
  };
  reactions?: { [emoji: string]: string[] };
  deleted?: boolean;
  deletedFor?: string[];   // UIDs para quienes está borrado (borrar solo para mí)
  deletedForAll?: boolean; // Borrado para todos
  edited?: boolean;
  viewOnce?: boolean;      // Mensaje que se ve solo una vez
  viewOnceData?: ViewOnceMedia;
}

export interface CallSession {
  id?: string;
  chatId: string;
  callerId: string;
  calleeIds: string[];
  type: 'audio' | 'video';
  status: 'ringing' | 'active' | 'ended' | 'declined' | 'missed';
  startedAt?: any;
  endedAt?: any;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  iceCandidates?: RTCIceCandidateInit[];
}