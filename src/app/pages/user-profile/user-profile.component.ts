import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  Firestore, doc, getDoc, collection, query, where, getDocs, orderBy,
  addDoc, updateDoc, deleteDoc
} from '@angular/fire/firestore';
import { AuthService } from '../../services/auth.service';
import { ChatService } from '../../services/chat.service';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './user-profile.component.html',
  styleUrls: ['./user-profile.component.scss']
})
export class UserProfileComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private firestore = inject(Firestore);
  private auth = inject(AuthService);
  private chatService = inject(ChatService);

  profileUser: any = null;
  posts: any[] = [];
  reels: any[] = [];
  loading = true;
  notFound = false;

  myUid = '';
  friendsCount = 0;

  // Estado de amistad con el usuario del perfil:
  // 'none' | 'pending-sent' | 'pending-received' | 'friends'
  friendStatus: 'none' | 'pending-sent' | 'pending-received' | 'friends' = 'none';
  friendRequestId: string | null = null;
  friendActionLoading = false;

  // 🔍 BUSCADOR
  searchTerm: string = '';
  searchResults: any[] = [];
  searching = false;

  async ngOnInit() {
  this.route.paramMap.subscribe(async params => {
    const uid = params.get('id');
    if (!uid) return;

    this.loading = true;
    this.notFound = false;
    this.profileUser = null;
    this.posts = [];
    this.reels = [];

    try {
      const me = await firstValueFrom(this.auth.user$);
      this.myUid = me?.uid || '';

      if (me?.uid === uid) {
        this.router.navigate(['/profile']);
        return;
      }

      await this.loadProfile(uid);
      await this.loadFriendStatus(uid);
      await this.loadFriendsCount(uid);

    } catch (err) {
      console.error("ERROR EN ngOnInit:", err);
      this.loading = false;
      this.notFound = true;
    }
  });
}

  async loadProfile(uid: string) {
  this.loading = true;
  this.notFound = false;

  try {
    const userSnap = await getDoc(doc(this.firestore, `users/${uid}`));

    // 🔥 VALIDACIÓN CRÍTICA
    if (!userSnap.exists()) {
      console.warn('Usuario no encontrado:', uid);
      this.notFound = true;
      this.loading = false; // 👈 CLAVE
      return;
    }

    this.profileUser = { id: userSnap.id, ...userSnap.data() };

    // ---------------- POSTS ----------------
    const postsSnap = await getDocs(
      query(
        collection(this.firestore, 'posts'),
        where('userId', '==', uid)
      )
    );

    this.posts = postsSnap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      createdAt: (d.data() as any).createdAt?.toDate?.() ?? new Date()
    }));

    // ---------------- REELS ----------------
    const reelsSnap = await getDocs(
      query(
        collection(this.firestore, 'reels'),
        where('uid', '==', uid)
      )
    );

    this.reels = reelsSnap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      createdAt: (d.data() as any).createdAt?.toDate?.() ?? new Date()
    }));

  } catch (err) {
    console.error("❌ ERROR LOAD PROFILE:", err);
    this.notFound = true;
  } finally {
    // 🔥 SIEMPRE se ejecuta
    this.loading = false;
  }
}
  // ═══════════════════════════════════════════════════════════════════════
  // AMISTAD
  // ═══════════════════════════════════════════════════════════════════════

  /** Carga si ya existe una solicitud (en cualquier dirección) entre ambos */
  async loadFriendStatus(otherUid: string) {
    if (!this.myUid) return;

    const [sentSnap, receivedSnap] = await Promise.all([
      getDocs(query(collection(this.firestore, 'friendRequests'), where('from', '==', this.myUid))),
      getDocs(query(collection(this.firestore, 'friendRequests'), where('to', '==', this.myUid)))
    ]);

    const sent = sentSnap.docs.find(d => d.data()['to'] === otherUid);
    const received = receivedSnap.docs.find(d => d.data()['from'] === otherUid);
    const match = sent || received;

    if (!match) {
      this.friendStatus = 'none';
      this.friendRequestId = null;
      return;
    }

    this.friendRequestId = match.id;
    const status = match.data()['status'];

    if (status === 'accepted') {
      this.friendStatus = 'friends';
    } else if (status === 'pending') {
      this.friendStatus = sent ? 'pending-sent' : 'pending-received';
    } else {
      // Rechazada — se puede volver a enviar
      this.friendStatus = 'none';
      this.friendRequestId = null;
    }
  }

  /** Cuenta cuántas solicitudes aceptadas tiene ese usuario (su número de amigos) */
  async loadFriendsCount(uid: string) {
    const [asFrom, asTo] = await Promise.all([
      getDocs(query(
        collection(this.firestore, 'friendRequests'),
        where('from', '==', uid), where('status', '==', 'accepted')
      )),
      getDocs(query(
        collection(this.firestore, 'friendRequests'),
        where('to', '==', uid), where('status', '==', 'accepted')
      ))
    ]);
    this.friendsCount = asFrom.size + asTo.size;
  }

  async sendFriendRequest() {
    if (!this.myUid || !this.profileUser?.id || this.friendActionLoading) return;
    this.friendActionLoading = true;
    try {
      const ref = await addDoc(collection(this.firestore, 'friendRequests'), {
        from: this.myUid,
        to: this.profileUser.id,
        status: 'pending',
        createdAt: new Date()
      });
      this.friendRequestId = ref.id;
      this.friendStatus = 'pending-sent';
    } catch (e) {
      console.error('Error enviando solicitud:', e);
    } finally {
      this.friendActionLoading = false;
    }
  }

  async acceptFriendRequest() {
    if (!this.friendRequestId || this.friendActionLoading) return;
    this.friendActionLoading = true;
    try {
      await updateDoc(doc(this.firestore, `friendRequests/${this.friendRequestId}`), { status: 'accepted' });
      this.friendStatus = 'friends';
      if (this.profileUser?.id) await this.loadFriendsCount(this.profileUser.id);
    } catch (e) {
      console.error('Error aceptando solicitud:', e);
    } finally {
      this.friendActionLoading = false;
    }
  }

  async rejectFriendRequest() {
    if (!this.friendRequestId || this.friendActionLoading) return;
    this.friendActionLoading = true;
    try {
      await updateDoc(doc(this.firestore, `friendRequests/${this.friendRequestId}`), { status: 'rejected' });
      this.friendStatus = 'none';
      this.friendRequestId = null;
    } catch (e) {
      console.error('Error rechazando solicitud:', e);
    } finally {
      this.friendActionLoading = false;
    }
  }

  /** Cancelar una solicitud que yo envié y sigue pendiente */
  async cancelFriendRequest() {
    if (!this.friendRequestId || this.friendActionLoading) return;
    this.friendActionLoading = true;
    try {
      await deleteDoc(doc(this.firestore, `friendRequests/${this.friendRequestId}`));
      this.friendStatus = 'none';
      this.friendRequestId = null;
    } catch (e) {
      console.error('Error cancelando solicitud:', e);
    } finally {
      this.friendActionLoading = false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MENSAJE — abre (o crea) el chat 1 a 1 con este usuario
  // ═══════════════════════════════════════════════════════════════════════
  async sendMessage() {
    if (!this.profileUser?.id) return;
    this.router.navigate(['/chat'], { queryParams: { userId: this.profileUser.id } });
  }

  // 🔎 BUSCAR USUARIOS
  async searchUsers() {
    if (!this.searchTerm || this.searchTerm.trim().length < 2) {
      this.searchResults = [];
      return;
    }

    this.searching = true;

    const term = this.searchTerm.toLowerCase();

    const q = query(
      collection(this.firestore, 'users'),
      where('displayNameLower', '>=', term),
      where('displayNameLower', '<=', term + '\uf8ff')
    );

    const snap = await getDocs(q);

    this.searchResults = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));

    this.searching = false;
  }

  // 🚀 IR A PERFIL
  goToUser(uid: string) {
    this.searchResults = [];
    this.searchTerm = '';
    this.router.navigate(['/user', uid]);
  }

  goBack() {
    this.router.navigate(['/feed']);
  }
}