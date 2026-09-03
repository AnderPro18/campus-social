import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  Firestore, collection, getDocs, query, where,
  doc, updateDoc, deleteDoc, getDoc, addDoc
} from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';

interface PersonCard {
  id: string;
  displayName: string;
  photoURL?: string;
  mutualCount: number;
  requestId?: string; // presente cuando hay una solicitud de por medio
}

@Component({
  selector: 'app-friends',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './friends.component.html',
  styleUrls: ['./friends.component.scss']
})
export class FriendsComponent implements OnInit {

  private firestore = inject(Firestore);
  private auth = inject(Auth);
  private router = inject(Router);

  currentUserId = '';
  loading = true;

  activeTab: 'friends' | 'suggestions' = 'friends';

  // ── AMIGOS ──────────────────────────────────────────────────────────────
  friends: PersonCard[] = [];
  friendsFiltered: PersonCard[] = [];
  friendSearchTerm = '';
  openMenuFor: string | null = null;

  // ── SUGERENCIAS ─────────────────────────────────────────────────────────
  pendingReceived: PersonCard[] = [];
  suggestions: PersonCard[] = [];

  // Sets internos para derivar todo sin repetir consultas
  private myAcceptedUids = new Set<string>();
  private pendingSentUids = new Set<string>();
  private pendingReceivedUids = new Set<string>();

  async ngOnInit() {
    this.currentUserId = this.auth.currentUser?.uid || '';
    if (!this.currentUserId) return;
    await this.loadAll();
  }

  setTab(tab: 'friends' | 'suggestions') {
    this.activeTab = tab;
    this.openMenuFor = null;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CARGA PRINCIPAL
  // ═══════════════════════════════════════════════════════════════════════
  async loadAll() {
    this.loading = true;
    try {
      const [sentSnap, receivedSnap] = await Promise.all([
        getDocs(query(collection(this.firestore, 'friendRequests'), where('from', '==', this.currentUserId))),
        getDocs(query(collection(this.firestore, 'friendRequests'), where('to', '==', this.currentUserId)))
      ]);

      this.myAcceptedUids.clear();
      this.pendingSentUids.clear();
      this.pendingReceivedUids.clear();

      const acceptedEntries: { uid: string; requestId: string }[] = [];
      const pendingReceivedEntries: { uid: string; requestId: string }[] = [];

      sentSnap.forEach(d => {
        const data = d.data() as any;
        if (data.status === 'accepted') {
          this.myAcceptedUids.add(data.to);
          acceptedEntries.push({ uid: data.to, requestId: d.id });
        } else if (data.status === 'pending') {
          this.pendingSentUids.add(data.to);
        }
      });

      receivedSnap.forEach(d => {
        const data = d.data() as any;
        if (data.status === 'accepted') {
          this.myAcceptedUids.add(data.from);
          acceptedEntries.push({ uid: data.from, requestId: d.id });
        } else if (data.status === 'pending') {
          this.pendingReceivedUids.add(data.from);
          pendingReceivedEntries.push({ uid: data.from, requestId: d.id });
        }
      });

      // ── Lista de amigos, con conteo de amigos en común ──
      this.friends = await Promise.all(
        acceptedEntries.map(async e => this.buildCard(e.uid, e.requestId))
      );
      this.applyFriendSearch();

      // ── Solicitudes de amistad pendientes recibidas ──
      this.pendingReceived = await Promise.all(
        pendingReceivedEntries.map(async e => this.buildCard(e.uid, e.requestId))
      );

      // ── Sugerencias: usuarios que no son amigos ni tienen solicitud pendiente ──
      await this.loadSuggestions();

    } catch (e) {
      console.error('Error cargando amigos:', e);
    } finally {
      this.loading = false;
    }
  }

  private async buildCard(uid: string, requestId?: string): Promise<PersonCard> {
    const snap = await getDoc(doc(this.firestore, `users/${uid}`));
    const data: any = snap.exists() ? snap.data() : {};
    return {
      id: uid,
      displayName: data.displayName || 'Usuario',
      photoURL: data.photoURL || '',
      mutualCount: await this.mutualFriendsCount(uid),
      requestId
    };
  }

  /** Cuenta cuántos amigos tengo en común con `uid` */
  private async mutualFriendsCount(uid: string): Promise<number> {
    if (uid === this.currentUserId) return 0;
    const [sentSnap, receivedSnap] = await Promise.all([
      getDocs(query(
        collection(this.firestore, 'friendRequests'),
        where('from', '==', uid), where('status', '==', 'accepted')
      )),
      getDocs(query(
        collection(this.firestore, 'friendRequests'),
        where('to', '==', uid), where('status', '==', 'accepted')
      ))
    ]);
    const theirFriends = new Set<string>();
    sentSnap.forEach(d => theirFriends.add((d.data() as any).to));
    receivedSnap.forEach(d => theirFriends.add((d.data() as any).from));

    let count = 0;
    theirFriends.forEach(f => { if (this.myAcceptedUids.has(f)) count++; });
    return count;
  }

  private async loadSuggestions() {
    const usersSnap = await getDocs(collection(this.firestore, 'users'));
    const exclude = new Set<string>([
      this.currentUserId,
      ...this.myAcceptedUids,
      ...this.pendingSentUids,
      ...this.pendingReceivedUids
    ]);

    const candidates = usersSnap.docs.filter(d => !exclude.has(d.id)).slice(0, 30);

    this.suggestions = await Promise.all(
      candidates.map(async d => ({
        id: d.id,
        displayName: (d.data() as any).displayName || 'Usuario',
        photoURL: (d.data() as any).photoURL || '',
        mutualCount: await this.mutualFriendsCount(d.id)
      }))
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // BUSCADOR (pestaña Amigos)
  // ═══════════════════════════════════════════════════════════════════════
  applyFriendSearch() {
    const term = this.friendSearchTerm.trim().toLowerCase();
    this.friendsFiltered = !term
      ? this.friends
      : this.friends.filter(f => f.displayName.toLowerCase().includes(term));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ACCIONES: SOLICITUDES
  // ═══════════════════════════════════════════════════════════════════════
  async confirmRequest(person: PersonCard) {
    if (!person.requestId) return;
    await updateDoc(doc(this.firestore, `friendRequests/${person.requestId}`), { status: 'accepted' });
    this.pendingReceived = this.pendingReceived.filter(p => p.id !== person.id);
    await this.loadAll();
  }

  async declineRequest(person: PersonCard) {
    if (!person.requestId) return;
    await updateDoc(doc(this.firestore, `friendRequests/${person.requestId}`), { status: 'rejected' });
    this.pendingReceived = this.pendingReceived.filter(p => p.id !== person.id);
  }

  async sendRequest(person: PersonCard) {
    const ref = collection(this.firestore, 'friendRequests');
    await addDoc(ref, {
      from: this.currentUserId,
      to: person.id,
      status: 'pending',
      createdAt: new Date()
    });
    this.suggestions = this.suggestions.filter(s => s.id !== person.id);
  }

  /** "Eliminar" en sugerencias: solo la oculta de esta sesión (no persiste) */
  dismissSuggestion(person: PersonCard) {
    this.suggestions = this.suggestions.filter(s => s.id !== person.id);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ACCIONES: LISTA DE AMIGOS (menú "···")
  // ═══════════════════════════════════════════════════════════════════════
  toggleMenu(personId: string, event: Event) {
    event.stopPropagation();
    this.openMenuFor = this.openMenuFor === personId ? null : personId;
  }

  closeMenus() {
    this.openMenuFor = null;
  }

  goToProfile(personId: string) {
    this.closeMenus();
    this.router.navigate(['/user', personId]);
  }

  async messageFriend(person: PersonCard) {
    this.closeMenus();
    this.router.navigate(['/chat'], { queryParams: { userId: person.id } });
  }

  async removeFriend(person: PersonCard) {
    this.closeMenus();
    if (!person.requestId) return;
    await deleteDoc(doc(this.firestore, `friendRequests/${person.requestId}`));
    this.friends = this.friends.filter(f => f.id !== person.id);
    this.applyFriendSearch();
  }
}