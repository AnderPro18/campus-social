import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  Firestore,
  collection,
  doc,
  setDoc,
  serverTimestamp
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

const CLOUD_NAME   = 'dz3mg9tom';
const UPLOAD_PRESET = 'campus_reels';

@Injectable({
  providedIn: 'root'
})
export class UploadService {

  private http      = inject(HttpClient);
  private firestore = inject(Firestore);

  /**
   * Sube el video a Cloudinary y luego guarda el documento en Firestore.
   * Emite { progress: 0-100 } mientras sube y { progress: 100, reel } al terminar.
   */
  uploadVideo(
    file: File,
    data: { uid: string; userName: string; description?: string; avatarUrl?: string }
  ): Observable<{ progress?: number; reel?: any }> {

    return new Observable(observer => {
      const reelId   = Date.now().toString();
      const formData = new FormData();

      formData.append('file',          file);
      formData.append('upload_preset', UPLOAD_PRESET);
      formData.append('folder',        'reels');
      formData.append('public_id',     reelId);
      formData.append('resource_type', 'video');

      const xhr = new XMLHttpRequest();

      // ── Progreso ──────────────────────────────────────────────
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          observer.next({ progress });
        }
      });

      // ── Completado ────────────────────────────────────────────
      xhr.addEventListener('load', async () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const cloudRes = JSON.parse(xhr.responseText);
            const videoUrl = cloudRes.secure_url;

            const reel = {
              id:            reelId,
              uid:           data.uid,
              userName:      data.userName,
              avatarUrl:     data.avatarUrl   || '',
              description:   data.description || '',
              videoUrl,
              likes:         0,
              commentsCount: 0,
              createdAt:     serverTimestamp()
            };

            await setDoc(
              doc(collection(this.firestore, 'reels'), reelId),
              reel
            );

            observer.next({ progress: 100, reel });
            observer.complete();
          } catch (err) {
            observer.error(err);
          }
        } else {
          observer.error(new Error(`Cloudinary error ${xhr.status}: ${xhr.responseText}`));
        }
      });

      // ── Error de red ──────────────────────────────────────────
      xhr.addEventListener('error', () => {
        observer.error(new Error('Error de red al subir el video'));
      });

      xhr.open(
        'POST',
        `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`
      );
      xhr.send(formData);

      // Permite cancelar
      return () => xhr.abort();
    });
  }
}