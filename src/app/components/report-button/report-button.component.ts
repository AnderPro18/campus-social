import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReportService } from '../../services/report.service';
import {
  ReportedItemType,
  ReportReason,
  REPORT_REASON_LABELS,
} from '../../models/report.model';

@Component({
  selector: 'app-report-button',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './report-button.component.html',
  styleUrls: ['./report-button.component.scss'],
})
export class ReportButtonComponent {
  /** Tipo de contenido que se está reportando */
  @Input({ required: true }) itemType!: ReportedItemType;
  /** ID del documento reportado */
  @Input({ required: true }) itemId!: string;
  /** Ruta completa en Firestore, ej: `posts/${postId}` o `reels/${reelId}/comments/${commentId}` */
  @Input({ required: true }) itemPath!: string;
  /** UID del dueño del contenido, si se conoce */
  @Input() itemOwnerId?: string;
  /** Texto opcional junto al icono (ej. "Reportar usuario") */
  @Input() label = '';

  private reportService = inject(ReportService);

  modalOpen = false;
  submitting = false;
  submitted = false;
  selectedReason: ReportReason | null = null;
  details = '';
  error = '';

  readonly reasons = Object.entries(REPORT_REASON_LABELS) as [ReportReason, string][];

  get title(): string {
    return this.itemType === 'user' ? 'Reportar usuario' : 'Reportar contenido';
  }

  /** Con el motivo "Otro" el detalle es obligatorio, para que el moderador entienda el caso */
  get canSubmit(): boolean {
    if (!this.selectedReason || this.submitting) return false;
    return this.selectedReason !== 'other' || this.details.trim().length > 0;
  }

  openModal() {
    this.modalOpen = true;
    this.submitted = false;
    this.selectedReason = null;
    this.details = '';
    this.error = '';
  }

  closeModal() {
    this.modalOpen = false;
  }

  async submit() {
    if (!this.canSubmit) return;

    this.submitting = true;
    this.error = '';
    try {
      await this.reportService.submitReport({
        itemType: this.itemType,
        itemId: this.itemId,
        itemPath: this.itemPath,
        itemOwnerId: this.itemOwnerId,
        reason: this.selectedReason!,
        details: this.details.trim() || undefined,
      });
      this.submitted = true;
    } catch (err) {
      console.error('Error al enviar el reporte:', err);
      this.error = 'No se pudo enviar el reporte. Inténtalo de nuevo.';
    } finally {
      this.submitting = false;
    }
  }
}