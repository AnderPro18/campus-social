import { Timestamp } from '@angular/fire/firestore';

export type AppUserRole = 'user' | 'moderator' | 'admin';

export interface AppUser {
  uid: string;

  displayName?: string | null;
  email?: string | null;
  emailVerified?: boolean;
  photoURL?: string | null;
  role?: AppUserRole;

  // Datos escritos por el flujo actual de registro y completado de perfil.
  fechaNacimiento?: string;
  ciudad?: string;
  departamento?: string;
  location?: string;
  carrera?: string;
  area?: string;
  descripcion?: string;

  // Campos que aún usa la pantalla de perfil existente.
  bio?: string;
  career?: string;
  careerOrArea?: string;
  birthDate?: string;
  birthPlace?: string;
  avatar?: string;
  cover?: string;

  followersCount?: number;
  followingCount?: number;
  fcmTokens?: string[];
  updatedAt?: Timestamp | Date;
}