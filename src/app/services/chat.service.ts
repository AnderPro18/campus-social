import { inject, Injectable } from '@angular/core';
import {
  Firestore,
  collection, collectionData, addDoc, doc, docData,
  updateDoc, query, where, orderBy, serverTimestamp,
  getDocs, getDoc, setDoc, arrayUnion, arrayRemove, writeBatch,
  onSnapshot, deleteField, deleteDoc, limit
} from '@angular/fire/firestore';
import { Observable, of, combineLatest } from 'rxjs';
import { map, switchMap, filter } from 'rxjs/operators';
import { Chat, Message, CallSession } from '../models/chat.model';
import { AuthService } from './auth.service';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);
  private http = inject(HttpClient);

  // ─── HELPERS ──────────────────────────────────────────────────────────────
  private get uid(): string {
    return this.auth.currentUid || this.auth.currentUserId || '';
  }

  /** Obtiene el UID de forma segura; si Auth aun no inicializo espera hasta 3 s */
  private async safeUid(): Promise<string> {
    const immediate = this.auth.currentUid || this.auth.currentUserId;
    if (immediate) return immediate;

    return new Promise((resolve, reject) => {
      const sub = this.auth.user$.pipe(
        filter((u): u is any => u != null)
      ).subscribe(user => {
        if (user) {
          sub.unsubscribe();
          resolve(user.uid);
        }
      });
      setTimeout(() => {
        sub.unsubscribe();
        reject(new Error('Usuario no autenticado'));
      }, 3000);
    });
  }

  // ─── CHATS ────────────────────────────────────────────────────────────────
  getMyChats(): Observable<Chat[]> {
    return this.auth.authenticatedUser$.pipe(
      switchMap(user => {
        const q = query(
          collection(this.firestore, 'chats'),
          where('members', 'array-contains', user.uid),
          orderBy('lastUpdated', 'desc')
        );
        return collectionData(q, { idField: 'id' }) as Observable<Chat[]>;
      })
    );
  }

  getChatById(chatId: string): Observable<Chat> {
    return docData(
      doc(this.firestore, `chats/${chatId}`),
      { idField: 'id' }
    ) as Observable<Chat>;
  }

  async getOrCreateDM(otherUid: string): Promise<string> {
    const myUid = await this.safeUid();
    if (!myUid) throw new Error('Usuario no autenticado');
    const chatId = [myUid, otherUid].sort().join('_');
    await setDoc(doc(this.firestore, `chats/${chatId}`), {
      type: 'dm',
      members: [myUid, otherUid],
      createdAt: serverTimestamp(),
      lastUpdated: serverTimestamp(),
      lastMessage: ''
    }, { merge: true });
    return chatId;
  }

  async createGroup(
    name: string,
    memberUids: string[],
    photoURL?: string
  ): Promise<string> {
    const myUid = await this.safeUid();
    const allMembers = [myUid, ...memberUids.filter(u => u !== myUid)];
    const ref = await addDoc(collection(this.firestore, 'chats'), {
      type: 'group',
      groupName: name,
      groupPhoto: photoURL || '',
      members: allMembers,
      adminUid: myUid,
      createdAt: serverTimestamp(),
      lastUpdated: serverTimestamp(),
      lastMessage: ''
    });
    return ref.id;
  }

  // ─── MENSAJES ─────────────────────────────────────────────────────────────
  getMessages(chatId: string): Observable<Message[]> {
    const q = query(
      collection(this.firestore, `chats/${chatId}/messages`),
      orderBy('createdAt', 'asc')
    );
    return collectionData(q, { idField: 'id' }) as Observable<Message[]>;
  }

  async sendMessage(chatId: string, payload: Partial<Message>): Promise<void> {
    const myUid = await this.safeUid();
    const msg: any = {
      senderId: myUid,
      type: payload.type || 'text',
      createdAt: serverTimestamp(),
      readBy: [myUid],
      deleted: false,
      deletedFor: [],
      deletedForAll: false,
      ...payload
    };
    await addDoc(collection(this.firestore, `chats/${chatId}/messages`), msg);

    const preview = this.getMessagePreview(payload);
    await updateDoc(doc(this.firestore, `chats/${chatId}`), {
      lastMessage: preview,
      lastUpdated: serverTimestamp()
    });
  }

  private getMessagePreview(payload: Partial<Message>): string {
    if (payload.type === 'image')    return '📷 Imagen';
    if (payload.type === 'audio')    return '🎤 Audio';
    if (payload.type === 'file')     return `📄 ${payload.fileName || 'Archivo'}`;
    if (payload.type === 'gif')      return '🎬 GIF';
    if (payload.type === 'sticker')  return '🎭 Sticker';
    if (payload.type === 'location') return '📍 Ubicación';
    if (payload.type === 'emoji')    return payload.text || '😀';
    return payload.text || '';
  }

  // ─── SUBIR ARCHIVOS ───────────────────────────────────────────────────────
  async uploadFile(
    file: File,
    chatId: string,
    type: 'image' | 'audio' | 'file'
  ): Promise<{ url: string; name: string; size: number }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', 'chat_upload');

    const response: any = await firstValueFrom(
      this.http.post(
        `https://api.cloudinary.com/v1_1/dz3mg9tom/auto/upload`,
        formData
      )
    );

    return {
      url: response.secure_url,
      name: file.name,
      size: file.size
    };
  }

  uploadFileWithProgress(
    file: File,
    chatId: string,
    type: 'image' | 'audio' | 'file'
  ): Promise<{ url: string; name: string; size: number }> {
    return this.uploadFile(file, chatId, type);
  }

  // ─── MARCAR LEÍDO ─────────────────────────────────────────────────────────
  async markAsRead(chatId: string, messageIds: string[]): Promise<void> {
    const myUid = await this.safeUid();
    const batch = writeBatch(this.firestore);
    for (const msgId of messageIds) {
      batch.update(
        doc(this.firestore, `chats/${chatId}/messages/${msgId}`),
        { readBy: arrayUnion(myUid) }
      );
    }
    await batch.commit();
  }

  // ─── REACCIONES ───────────────────────────────────────────────────────────
  async reactToMessage(
    chatId: string,
    messageId: string,
    emoji: string
  ): Promise<void> {
    await updateDoc(
      doc(this.firestore, `chats/${chatId}/messages/${messageId}`),
      { [`reactions.${emoji}`]: arrayUnion(await this.safeUid()) }
    );
  }

  // ─── ELIMINAR MENSAJE ─────────────────────────────────────────────────────
  /** Borrar solo para mí: agrega el uid a deletedFor */
  async deleteMessageForMe(chatId: string, messageId: string): Promise<void> {
    const uid = await this.safeUid();
    await updateDoc(
      doc(this.firestore, `chats/${chatId}/messages/${messageId}`),
      { deletedFor: arrayUnion(uid) }
    );
  }

  /** Borrar para todos: marca deletedForAll y limpia el contenido */
  async deleteMessageForAll(chatId: string, messageId: string): Promise<void> {
    await updateDoc(
      doc(this.firestore, `chats/${chatId}/messages/${messageId}`),
      {
        deleted: true,
        deletedForAll: true,
        text: 'Mensaje eliminado',
        imageURL: null,
        audioURL: null,
        fileURL: null,
        gifURL: null,
        stickerURL: null,
      }
    );

    // Si el mensaje borrado es el más reciente del chat, el preview del
    // sidebar (chats.lastMessage) también debe reflejar que se eliminó.
    const lastSnap = await getDocs(
      query(
        collection(this.firestore, `chats/${chatId}/messages`),
        orderBy('createdAt', 'desc'),
        limit(1)
      )
    );
    if (!lastSnap.empty && lastSnap.docs[0].id === messageId) {
      await updateDoc(doc(this.firestore, `chats/${chatId}`), {
        lastMessage: 'Mensaje eliminado'
      });
    }
  }

  /** Compatibilidad con código anterior */
  async deleteMessage(chatId: string, messageId: string): Promise<void> {
    return this.deleteMessageForAll(chatId, messageId);
  }

  // ─── EDITAR ───────────────────────────────────────────────────────────────
  async editMessage(
    chatId: string,
    messageId: string,
    newText: string
  ): Promise<void> {
    await updateDoc(
      doc(this.firestore, `chats/${chatId}/messages/${messageId}`),
      { text: newText, edited: true }
    );
  }

  // ─── VIEW ONCE ────────────────────────────────────────────────────────────
  async markViewOnceViewed(chatId: string, messageId: string): Promise<void> {
    await updateDoc(
      doc(this.firestore, `chats/${chatId}/messages/${messageId}`),
      {
        'viewOnceData.viewed': true,
        'viewOnceData.viewedBy': arrayUnion(await this.safeUid())
      }
    );
  }

  // ─── VACIAR CHAT PARA MÍ ──────────────────────────────────────────────────
  /**
   * Marca todos los mensajes del chat con deletedFor del usuario actual.
   * Compatible con las reglas Firestore (no requiere delete, solo update).
   */
  async clearChatForMe(chatId: string): Promise<void> {
    const uid = await this.safeUid();
    const snap = await getDocs(
      collection(this.firestore, `chats/${chatId}/messages`)
    );

    // writeBatch tiene límite de 500 ops — dividir si hay muchos mensajes
    const BATCH_SIZE = 490;
    let batch = writeBatch(this.firestore);
    let count = 0;

    for (const d of snap.docs) {
      batch.update(d.ref, { deletedFor: arrayUnion(uid) });
      count++;
      if (count === BATCH_SIZE) {
        await batch.commit();
        batch = writeBatch(this.firestore);
        count = 0;
      }
    }

    if (count > 0) await batch.commit();
  }

  // ─── SALIR DE UN GRUPO ────────────────────────────────────────────────────
  /**
   * Remueve al usuario actual del array `members` del grupo.
   * Al dejar de ser miembro, las reglas de Firestore le quitan
   * automáticamente el acceso de lectura/escritura a ese chat.
   */
  async leaveGroup(chatId: string): Promise<void> {
    const uid = await this.safeUid();
    await updateDoc(doc(this.firestore, `chats/${chatId}`), {
      members: arrayRemove(uid)
    });
  }

  // ─── ELIMINAR GRUPO PERMANENTEMENTE (solo admin) ──────────────────────────
  /**
   * Borra todos los mensajes del grupo y luego el documento del chat.
   * Requiere que el usuario actual sea el adminUid del grupo (reglas de Firestore).
   */
  async deleteGroup(chatId: string): Promise<void> {
    const snap = await getDocs(
      collection(this.firestore, `chats/${chatId}/messages`)
    );

    const BATCH_SIZE = 490;
    let batch = writeBatch(this.firestore);
    let count = 0;

    for (const d of snap.docs) {
      batch.delete(d.ref);
      count++;
      if (count === BATCH_SIZE) {
        await batch.commit();
        batch = writeBatch(this.firestore);
        count = 0;
      }
    }
    if (count > 0) await batch.commit();

    await deleteDoc(doc(this.firestore, `chats/${chatId}`));
  }

  // ─── FAVORITOS ────────────────────────────────────────────────────────────
  async toggleFavoriteChat(chatId: string, current: boolean): Promise<void> {
    await updateDoc(doc(this.firestore, `chats/${chatId}`), {
      favorite: !current
    });
  }

  // ─── ACTUALIZAR META DEL CHAT ─────────────────────────────────────────────
  /** Actualiza campos del documento del chat (temporal, lista, etc.) */
  async updateChatMeta(
    chatId: string,
    data: Record<string, any>
  ): Promise<void> {
    await updateDoc(doc(this.firestore, `chats/${chatId}`), data);
  }

  // ─── LLAMADAS (WebRTC signaling via Firestore) ────────────────────────────
  async createCall(
    chatId: string,
    type: 'audio' | 'video',
    calleeIds: string[]
  ): Promise<string> {
    const callerId = await this.safeUid();
    const ref = await addDoc(collection(this.firestore, 'calls'), {
      chatId,
      callerId,
      calleeIds,
      type,
      status: 'ringing',
      startedAt: serverTimestamp(),
    } as CallSession);
    return ref.id;
  }

  getCall(callId: string): Observable<CallSession> {
    return docData(
      doc(this.firestore, `calls/${callId}`),
      { idField: 'id' }
    ) as Observable<CallSession>;
  }

  async updateCallStatus(
    callId: string,
    status: CallSession['status']
  ): Promise<void> {
    const data: any = { status };
    if (status === 'ended') data.endedAt = serverTimestamp();
    await updateDoc(doc(this.firestore, `calls/${callId}`), data);
  }

  async sendCallSignal(callId: string, data: any): Promise<void> {
    const uid = await this.safeUid();
    await addDoc(collection(this.firestore, `calls/${callId}/signals`), {
      ...data,
      from: uid,
      createdAt: serverTimestamp()
    });
  }

  getCallSignals(callId: string): Observable<any[]> {
    const q = query(
      collection(this.firestore, `calls/${callId}/signals`),
      orderBy('createdAt', 'asc')
    );
    return collectionData(q, { idField: 'id' });
  }

  // ─── USUARIOS ─────────────────────────────────────────────────────────────
  async getUserProfile(uid: string): Promise<any> {
    const snap = await getDoc(doc(this.firestore, `users/${uid}`));
    return snap.exists() ? { uid, ...snap.data() } : null;
  }

  async searchUsers(term: string): Promise<any[]> {
    const snap = await getDocs(collection(this.firestore, 'users'));
    const myUid = this.uid;
    return snap.docs
      .map(d => ({ uid: d.id, ...d.data() }))
      .filter((u: any) => {
        const name = (u.displayName || u.name || '').toLowerCase();
        return u.uid !== myUid && name.includes(term.toLowerCase());
      });
  }

  // ─── CONTADOR NO LEÍDOS ───────────────────────────────────────────────────
  getUnreadChatsCount(): Observable<number> {
    const uid = this.uid;
    if (!uid) return of(0);
    return this.getMyChats().pipe(
      switchMap((chats: Chat[]) => {
        if (!chats.length) return of(0);
        const observables = chats.map(chat =>
          collectionData(
            query(collection(this.firestore, `chats/${chat.id}/messages`)),
            { idField: 'id' }
          ).pipe(
            map((messages: any[]) =>
              messages.filter(m =>
                m.senderId !== uid &&
                (!m.readBy || !m.readBy.includes(uid)) &&
                !m.deletedFor?.includes(uid)
              ).length
            )
          )
        );
        return combineLatest(observables).pipe(
          map(counts => counts.reduce((a, b) => a + b, 0))
        );
      })
    );
  }

  getIncomingCalls(): Observable<CallSession[]> {
    const q = query(
      collection(this.firestore, 'calls'),
      where('calleeIds', 'array-contains', this.uid),
      where('status', '==', 'ringing')
    );
    return collectionData(q, { idField: 'id' }) as Observable<CallSession[]>;
  }
}