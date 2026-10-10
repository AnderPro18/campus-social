import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  doc,
  updateDoc,
  query,
  where,
  orderBy,
  collectionData,
  Timestamp,
} from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { Observable } from 'rxjs';
import { Report, ReportPayload, ReportStatus } from '../models/report.model';

@Injectable({ providedIn: 'root' })
export class ReportService {
  private firestore = inject(Firestore);
  private auth = inject(Auth);

  /** Crea un reporte. Cualquier usuario autenticado puede reportar. */
  async submitReport(payload: Omit<ReportPayload, 'reporterId'>): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('Debes iniciar sesión para reportar contenido.');

    const reportsRef = collection(this.firestore, 'reports');
    await addDoc(reportsRef, {
      ...payload,
      reporterId: user.uid,
      status: 'pending' as ReportStatus,
      createdAt: Timestamp.now(),
    });
  }

  /** Solo para el panel de moderación: reportes pendientes, más recientes primero. */
  getPendingReports(): Observable<Report[]> {
    const reportsRef = collection(this.firestore, 'reports');
    const q = query(
      reportsRef,
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    );
    return collectionData(q, { idField: 'id' }) as Observable<Report[]>;
  }

  /** Marca un reporte como revisado o descartado. */
  async resolveReport(
    reportId: string,
    status: 'reviewed' | 'dismissed',
    resolutionNote?: string
  ): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('No autenticado.');

    const reportRef = doc(this.firestore, `reports/${reportId}`);
    await updateDoc(reportRef, {
      status,
      reviewedBy: user.uid,
      reviewedAt: Timestamp.now(),
      ...(resolutionNote ? { resolutionNote } : {}),
    });
  }
}
