import { Injectable, inject } from '@angular/core';
import {
  Firestore, doc, getDoc, setDoc, deleteDoc,
  collection, collectionData, serverTimestamp
} from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { firstValueFrom, map, switchMap, from, combineLatest } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SavedService {

  private firestore = inject(Firestore);
  private auth = inject(AuthService);

  // ─── Guardar / quitar ──────────────────────────────────────────
  async toggleSave(
    postId: string,
    type: 'post' | 'reel' = 'post',
    extraData?: Record<string, any>   // ← metadatos opcionales del ítem
  ): Promise<{ saved: boolean }> {
    const user = await firstValueFrom(this.auth.user$);
    if (!user) throw new Error('No autenticado');

const ref = doc(this.firestore, `users/${user.uid}/savedPosts/${postId}`);    const snap = await getDoc(ref);

    if (snap.exists()) {
      await deleteDoc(ref);
      return { saved: false };
    }

    await setDoc(ref, {
      id: postId,
      type,
      savedAt: serverTimestamp(),
      ...(extraData ?? {})   // ← spread: guarda description, videoUrl, etc.
    });

    return { saved: true };
  }

  // ─── Obtener guardados con datos completos ─────────────────────
  getSavedPosts(uid: string) {
const savedRef = collection(this.firestore, `users/${uid}/savedPosts`);
    return collectionData(savedRef, { idField: 'docId' }).pipe(
      switchMap((savedList: any[]) => {
        if (savedList.length === 0) return from([[]]);

        const calls = savedList.map(saved => {
          const colName = saved.type === 'reel' ? 'reels' : 'posts';
          const itemRef = doc(this.firestore, `${colName}/${saved.id}`);

          return from(getDoc(itemRef)).pipe(
            map(snap => {
              // Si el doc ya no existe en Firestore, usamos los
              // metadatos que guardamos en el momento del save
              const firestoreData = snap.exists() ? snap.data() : {};

              // Los datos del saved tienen prioridad para description/videoUrl
              // porque pueden haber sido enriquecidos con extraData
              return {
                ...firestoreData,
                ...saved,           // saved sobreescribe: tiene description, videoUrl, etc.
                id: saved.id,
              };
            })
          );
        });

        return combineLatest(calls).pipe(
          map(items => items.filter(Boolean))
        );
      })
    );
  }

  // ─── Eliminar guardado ─────────────────────────────────────────
  async removeSave(postId: string) {
    const user = await firstValueFrom(this.auth.user$);
    if (!user) throw new Error('No autenticado');

const ref = doc(this.firestore, `users/${user.uid}/savedPosts/${postId}`);    await deleteDoc(ref);
  }
}

