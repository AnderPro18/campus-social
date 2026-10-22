import { Timestamp } from '@angular/fire/firestore';
import { ReportedItemType } from './report.model';

/** Acciones que un moderador/admin puede realizar y que quedan registradas. */
export type AdminActionType =
  | 'report_dismissed'
  | 'report_reviewed'
  | 'content_deleted'
  | 'user_blocked'
  | 'user_unblocked';

/**
 * Registro de auditoría (colección `adminActions`).
 * Es inmutable: las reglas de Firestore solo permiten crear y leer.
 */
export interface AdminAction {
  id?: string;
  action: AdminActionType;

  /** Quién ejecutó la acción */
  adminId: string;
  adminName: string;

  /** Sobre qué se ejecutó */
  targetType: ReportedItemType;
  targetId: string;
  /** Ruta en Firestore del contenido (posts/abc, reels/x/comments/y ...) */
  targetPath?: string;
  /** Dueño del contenido, o el propio usuario si targetType es 'user' */
  targetOwnerId?: string;

  reportId?: string;
  note?: string;
  createdAt: Timestamp | Date;
}

export const ADMIN_ACTION_LABELS: Record<AdminActionType, string> = {
  report_dismissed: 'Reporte descartado',
  report_reviewed: 'Reporte revisado',
  content_deleted: 'Contenido eliminado',
  user_blocked: 'Usuario bloqueado',
  user_unblocked: 'Usuario desbloqueado',
};