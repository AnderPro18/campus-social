import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  WriteBatch,
  Timestamp,
  collection,
  collectionData,
  deleteField,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  where,
  writeBatch,
} from '@angular/fire/firestore';
import { Auth, authState } from '@angular/fire/auth';
import { Observable, from, of } from 'rxjs';
import { catchError, map, shareReplay, switchMap } from 'rxjs/operators';
import { Report, ReportedItemType } from '../models/report.model';
import { AdminAction, AdminActionType } from '../models/admin-action.model';

/** Datos del contenido reportado, para que el moderador lo vea sin salir del panel. */
export interface ReportedContentPreview {
  /** false si el documento ya no existe (p. ej. el dueño lo borró) */
  exists: boolean;
  /** true si no se pudo leer (permisos, red...) */
  error?: boolean;
  text?: string;
  imageUrl?: string;
  videoUrl?: string;
  ownerId?: string;
  ownerName?: string;
  /** Solo cuando se reporta a un usuario */
  user?: {
    displayName?: string;
    email?: string;
    photoURL?: string;
    careerOrArea?: string;
    bio?: string;
    blocked?: boolean;
  };
}

type LogTarget = {
  targetType: ReportedItemType;
  targetId: string;
  targetPath?: string;
  targetOwnerId?: string;
  reportId?: string;
  note?: string;
};

/** Firestore no acepta `undefined`: se quitan esas claves antes de escribir. */
function clean<T extends Record<string, any>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T;
}

@Injectable({ providedIn: 'root' })
export class ModerationService {
  private firestore = inject(Firestore);
  private auth = inject(Auth);

  /** true si el usuario actual tiene rol admin o moderator (para mostrar el acceso al panel). */
  readonly isModerator$: Observable<boolean> = authState(this.auth).pipe(
    switchMap(u =>
      u
        ? from(getDoc(doc(this.firestore, `users/${u.uid}`))).pipe(
            map(s => ['admin', 'moderator'].includes(s.data()?.['role']))
          )
        : of(false)
    ),
    catchError(() => of(false)),
    shareReplay(1)
  );

  // ── Lectura ────────────────────────────────────────────────────────────────

  /** Carga el contenido que apunta `report.itemPath`. */
  async getReportedContent(report: Report): Promise<ReportedContentPreview> {
    try {
      const snap = await getDoc(doc(this.firestore, report.itemPath));
      if (!snap.exists()) return { exists: false };
      const d: any = snap.data();

      switch (report.itemType) {
        case 'post':
          return {
            exists: true,
            text: d.content,
            imageUrl: d.imageUrl,
            videoUrl: d.videoUrl,
            ownerId: d.userId,
            ownerName: d.userName,
          };
        case 'reel':
          return {
            exists: true,
            text: d.description,
            videoUrl: d.videoUrl,
            ownerId: d.uid,
            ownerName: d.userName,
          };
        case 'comment':
        case 'reply':
          return {
            exists: true,
            text: d.content,
            ownerId: d.userId,
            ownerName: d.userName,
          };
        case 'user':
          return {
            exists: true,
            ownerId: snap.id,
            ownerName: d.displayName,
            user: {
              displayName: d.displayName,
              email: d.email,
              photoURL: d.avatar || d.photoURL,
              careerOrArea: d.careerOrArea || d.carrera || d.area,
              bio: d.bio,
              blocked: d.blocked === true,
            },
          };
      }
    } catch (err) {
      console.error('No se pudo cargar el contenido reportado:', err);
      return { exists: false, error: true };
    }
  }

  /** Usuario al que se le puede aplicar un bloqueo a partir de un reporte. */
  targetUserId(report: Report, preview?: ReportedContentPreview): string | undefined {
    if (report.itemType === 'user') return report.itemId;
    return report.itemOwnerId || preview?.ownerId;
  }

  getBlockedUsers(): Observable<any[]> {
    const q = query(collection(this.firestore, 'users'), where('blocked', '==', true));
    return collectionData(q, { idField: 'id' });
  }

  getRecentActions(max = 50): Observable<AdminAction[]> {
    const q = query(
      collection(this.firestore, 'adminActions'),
      orderBy('createdAt', 'desc'),
      limit(max)
    );
    return collectionData(q, { idField: 'id' }) as Observable<AdminAction[]>;
  }

  // ── Acciones (cada una se guarda de forma atómica junto con su registro) ──

  /** Descarta o marca como revisado un reporte. */
  async resolveReport(
    report: Report,
    status: 'reviewed' | 'dismissed',
    note?: string
  ): Promise<void> {
    this.requireReportId(report);
    const batch = writeBatch(this.firestore);

    batch.update(
      doc(this.firestore, `reports/${report.id}`),
      this.resolutionFields(status, note)
    );
    this.addLog(
      batch,
      status === 'dismissed' ? 'report_dismissed' : 'report_reviewed',
      this.reportTarget(report, note)
    );

    await batch.commit();
  }

  /**
   * Elimina el contenido reportado (publicación, reel, comentario o respuesta),
   * cierra todos los reportes pendientes sobre ese mismo contenido y lo registra.
   *
   * Limitaciones: no borra las subcolecciones (reacciones, comentarios) del
   * documento eliminado; quedan huérfanas pero invisibles. El video de un reel
   * en Cloudinary tampoco se borra desde el navegador.
   */
  async deleteContent(report: Report, note?: string): Promise<void> {
    this.requireReportId(report);
    if (report.itemType === 'user') {
      throw new Error('Un usuario no se elimina desde aquí: usa "Bloquear usuario".');
    }

    const batch = writeBatch(this.firestore);
    batch.delete(doc(this.firestore, report.itemPath));

    // Mantener coherentes los contadores del contenido padre
    const parts = report.itemPath.split('/');
    if (report.itemType === 'comment' && parts.length === 4) {
      batch.update(doc(this.firestore, parts[0], parts[1]), { commentsCount: increment(-1) });
    }
    if (report.itemType === 'reply' && parts.length === 6) {
      batch.update(doc(this.firestore, parts.slice(0, 4).join('/')), {
        repliesCount: increment(-1),
      });
    }

    // Cerrar todos los reportes pendientes de este mismo contenido
    const resolutionNote = note || 'Contenido eliminado por moderación';
    const same = await getDocs(
      query(
        collection(this.firestore, 'reports'),
        where('itemPath', '==', report.itemPath),
        where('status', '==', 'pending')
      )
    );
    const ids = new Set<string>([report.id!]);
    same.forEach(d => ids.add(d.id));
    ids.forEach(id =>
      batch.update(
        doc(this.firestore, `reports/${id}`),
        this.resolutionFields('reviewed', resolutionNote)
      )
    );

    this.addLog(batch, 'content_deleted', this.reportTarget(report, note));
    await batch.commit();
  }

  /** Bloquea a un usuario y cierra el reporte desde el que se decidió. */
  async blockUser(userId: string, reason: string, report?: Report): Promise<void> {
    const admin = this.requireUser();
    if (userId === admin.uid) throw new Error('No puedes bloquear tu propia cuenta.');
    if (!reason.trim()) throw new Error('Indica el motivo del bloqueo.');

    const batch = writeBatch(this.firestore);
    batch.update(doc(this.firestore, `users/${userId}`), {
      blocked: true,
      blockedAt: Timestamp.now(),
      blockedBy: admin.uid,
      blockReason: reason.trim(),
    });

    if (report?.id) {
      batch.update(
        doc(this.firestore, `reports/${report.id}`),
        this.resolutionFields('reviewed', `Usuario bloqueado: ${reason.trim()}`)
      );
    }

    this.addLog(batch, 'user_blocked', {
      targetType: 'user',
      targetId: userId,
      targetPath: `users/${userId}`,
      targetOwnerId: userId,
      reportId: report?.id,
      note: reason.trim(),
    });

    await batch.commit();
  }

  async unblockUser(userId: string, note?: string): Promise<void> {
    this.requireUser();
    const batch = writeBatch(this.firestore);

    batch.update(doc(this.firestore, `users/${userId}`), {
      blocked: false,
      blockedAt: deleteField(),
      blockedBy: deleteField(),
      blockReason: deleteField(),
    });

    this.addLog(batch, 'user_unblocked', {
      targetType: 'user',
      targetId: userId,
      targetPath: `users/${userId}`,
      targetOwnerId: userId,
      note,
    });

    await batch.commit();
  }

  // ── Auxiliares ─────────────────────────────────────────────────────────────

  private requireUser() {
    const user = this.auth.currentUser;
    if (!user) throw new Error('No autenticado.');
    return user;
  }

  private requireReportId(report: Report) {
    if (!report.id) throw new Error('El reporte no tiene id.');
  }

  private resolutionFields(status: 'reviewed' | 'dismissed', note?: string) {
    return clean({
      status,
      reviewedBy: this.requireUser().uid,
      reviewedAt: Timestamp.now(),
      resolutionNote: note?.trim() || undefined,
    });
  }

  private reportTarget(report: Report, note?: string): LogTarget {
    return {
      targetType: report.itemType,
      targetId: report.itemId,
      targetPath: report.itemPath,
      targetOwnerId: report.itemOwnerId,
      reportId: report.id,
      note: note?.trim() || undefined,
    };
  }

  /** Agrega al batch el registro de la acción (colección `adminActions`). */
  private addLog(batch: WriteBatch, action: AdminActionType, target: LogTarget) {
    const admin = this.requireUser();
    batch.set(
      doc(collection(this.firestore, 'adminActions')),
      clean({
        action,
        adminId: admin.uid,
        adminName: admin.displayName || admin.email || admin.uid,
        ...target,
        createdAt: Timestamp.now(),
      })
    );
  }
}