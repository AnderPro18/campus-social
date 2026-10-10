import { Timestamp } from '@angular/fire/firestore';

export type ReportedItemType = 'post' | 'comment' | 'reply' | 'reel' | 'user';

export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'hate_speech'
  | 'inappropriate_content'
  | 'misinformation'
  | 'other';

export type ReportStatus = 'pending' | 'reviewed' | 'dismissed';

export interface Report {
  id?: string;

  itemType: ReportedItemType;
  itemId: string;

  /** UID del dueño del contenido reportado, si aplica (posts, comments, reels) */
  itemOwnerId?: string;

  /** Ruta completa en Firestore, para que el moderador pueda navegar directo al documento
   *  (ej: "posts/abc123" o "reels/xyz789/comments/c1") */
  itemPath: string;

  reporterId: string;
  reason: ReportReason;
  details?: string;

  status: ReportStatus;
  createdAt: Timestamp | Date;

  reviewedBy?: string;
  reviewedAt?: Timestamp | Date;
  resolutionNote?: string;
}

/** Payload para crear un reporte (sin id, status ni createdAt) */
export interface ReportPayload {
  itemType: ReportedItemType;
  itemId: string;
  itemOwnerId?: string;
  itemPath: string;
  reporterId: string;
  reason: ReportReason;
  details?: string;
}

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: 'Spam o publicidad no deseada',
  harassment: 'Acoso o intimidación',
  hate_speech: 'Discurso de odio o discriminación',
  inappropriate_content: 'Contenido inapropiado',
  misinformation: 'Información falsa',
  other: 'Otro motivo',
}

export const REPORT_TYPE_LABELS: Record<ReportedItemType, string> = {
  post: 'Publicación',
  comment: 'Comentario',
  reply: 'Respuesta',
  reel: 'Reel',
  user: 'Usuario',
};
