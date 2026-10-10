import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Auth } from '@angular/fire/auth';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ReportService } from '../../services/report.service';
import {
  ModerationService,
  ReportedContentPreview,
} from '../../services/moderation.service';
import {
  Report,
  REPORT_REASON_LABELS,
  REPORT_TYPE_LABELS,
} from '../../models/report.model';
import { AdminAction, ADMIN_ACTION_LABELS } from '../../models/admin-action.model';

type Tab = 'reports' | 'blocked' | 'log';
type ActionKind = 'dismiss' | 'review' | 'delete' | 'block';

@Component({
  selector: 'app-moderation',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './moderation.component.html',
  styleUrls: ['./moderation.component.scss'],
})
export class ModerationComponent {
  private reportService = inject(ReportService);
  private moderation = inject(ModerationService);
  private auth = inject(Auth);

  readonly reasonLabels = REPORT_REASON_LABELS;
  readonly typeLabels = REPORT_TYPE_LABELS;
  readonly actionLabels = ADMIN_ACTION_LABELS;

  tab = signal<Tab>('reports');

  /** Contenido reportado, cargado por separado para cada reporte */
  previews = signal<Record<string, ReportedContentPreview>>({});

  /** Acción que se está confirmando (muestra el panel con la nota/motivo) */
  pending = signal<{ id: string; kind: ActionKind } | null>(null);
  processingId = signal<string | null>(null);
  error = signal('');
  note = '';

  reports$: Observable<Report[]> = this.reportService
    .getPendingReports()
    .pipe(tap(reports => this.loadPreviews(reports)));

  blocked$ = this.moderation.getBlockedUsers();
  actions$: Observable<AdminAction[]> = this.moderation.getRecentActions();

  get myUid(): string | undefined {
    return this.auth.currentUser?.uid;
  }

  // ── Vista ──────────────────────────────────────────────────────────────────

  setTab(tab: Tab) {
    this.tab.set(tab);
    this.cancel();
  }

  toDate(value: any): Date | null {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate();
    return value instanceof Date ? value : null;
  }

  /** Usuario al que se le puede aplicar un bloqueo desde este reporte */
  targetUser(report: Report): string | undefined {
    return this.moderation.targetUserId(report, this.previews()[report.id!]);
  }

  canBlock(report: Report): boolean {
    const target = this.targetUser(report);
    const preview = this.previews()[report.id!];
    return !!target && target !== this.myUid && !preview?.user?.blocked;
  }

  canDelete(report: Report): boolean {
    return report.itemType !== 'user' && !!this.previews()[report.id!]?.exists;
  }

  // ── Acciones ───────────────────────────────────────────────────────────────

  start(report: Report, kind: ActionKind) {
    this.error.set('');
    this.note = '';
    this.pending.set({ id: report.id!, kind });
  }

  cancel() {
    this.pending.set(null);
    this.note = '';
    this.error.set('');
  }

  /** El bloqueo exige un motivo; el resto de acciones lo dejan opcional */
  canConfirm(): boolean {
    const p = this.pending();
    if (!p || this.processingId()) return false;
    return p.kind !== 'block' || this.note.trim().length >= 3;
  }

  async confirm(report: Report) {
    const p = this.pending();
    if (!p || !this.canConfirm()) return;

    this.processingId.set(report.id!);
    this.error.set('');
    try {
      switch (p.kind) {
        case 'dismiss':
          await this.moderation.resolveReport(report, 'dismissed', this.note);
          break;
        case 'review':
          await this.moderation.resolveReport(report, 'reviewed', this.note);
          break;
        case 'delete':
          await this.moderation.deleteContent(report, this.note);
          break;
        case 'block': {
          const target = this.targetUser(report);
          if (!target) throw new Error('No se pudo identificar al usuario.');
          await this.moderation.blockUser(target, this.note, report);
          break;
        }
      }
      this.cancel();
    } catch (err: any) {
      console.error('Error en la acción de moderación:', err);
      this.error.set(err?.message || 'No se pudo completar la acción.');
    } finally {
      this.processingId.set(null);
    }
  }

  async unblock(user: any) {
    if (this.processingId()) return;
    this.processingId.set(user.id);
    this.error.set('');
    try {
      await this.moderation.unblockUser(user.id);
    } catch (err: any) {
      console.error('Error al desbloquear:', err);
      this.error.set(err?.message || 'No se pudo desbloquear al usuario.');
    } finally {
      this.processingId.set(null);
    }
  }

  // ── Carga de contenido ─────────────────────────────────────────────────────

  private loadPreviews(reports: Report[]) {
    for (const report of reports) {
      if (!report.id || this.previews()[report.id]) continue;
      const id = report.id;
      this.moderation.getReportedContent(report).then(preview =>
        this.previews.update(current => ({ ...current, [id]: preview }))
      );
    }
  }
}