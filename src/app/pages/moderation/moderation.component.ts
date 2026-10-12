import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';
import { ReportService } from '../../services/report.service';
import { Report, REPORT_REASON_LABELS } from '../../models/report.model';

@Component({
  selector: 'app-moderation',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './moderation.component.html',
  styleUrls: ['./moderation.component.scss'],
})
export class ModerationComponent {
  private reportService = inject(ReportService);

  reports$: Observable<Report[]> = this.reportService.getPendingReports();
  reasonLabels = REPORT_REASON_LABELS;
  processingId: string | null = null;

  async resolve(report: Report, status: 'reviewed' | 'dismissed') {
    if (!report.id || this.processingId) return;
    this.processingId = report.id;
    try {
      await this.reportService.resolveReport(report.id, status);
    } finally {
      this.processingId = null;
    }
  }
}
