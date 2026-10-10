export interface AppUser {

  uid: string;

  displayName: string;

  email?: string;

  photoURL?: string;

  bio?: string;

  career?: string;

  role?: 'user' | 'moderator' | 'admin';

    /** Bloqueo aplicado por un moderador (HU-15) */
  blocked?: boolean;

  blockedAt?: any;

  blockedBy?: string;

  blockReason?: string;
}