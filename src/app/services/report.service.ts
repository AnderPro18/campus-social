import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  doc,
  updateDoc,
  query,
  where,
  collectionData,
  Timestamp,
} from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
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
    // Firestore rechaza los campos con valor `undefined` (por ejemplo "details" cuando
    // el usuario no escribe nada), así que se quitan antes de guardar.
    const data = Object.fromEntries(
      Object.entries({
        ...payload,
        reporterId: user.uid,
        status: 'pending' as ReportStatus,
        createdAt: Timestamp.now(),
      }).filter(([, value]) => value !== undefined)
    );

    await addDoc(reportsRef, data);
  }

  /** Solo para el panel de moderación: reportes pendientes, más recientes primero. */
  getPendingReports(): Observable<Report[]> {
    const reportsRef = collection(this.firestore, 'reports');
    // Solo filtra por estado (no necesita índice compuesto) y ordena en el cliente.
    const q = query(reportsRef, where('status', '==', 'pending'));
    return (collectionData(q, { idField: 'id' }) as Observable<Report[]>).pipe(
      map(reports => [...reports].sort((a, b) => this.millis(b.createdAt) - this.millis(a.createdAt)))
    );
  }

  private millis(value: any): number {
    if (value?.toMillis) return value.toMillis();
    return value instanceof Date ? value.getTime() : 0;
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