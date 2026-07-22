import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  Firestore,
  collection,
  collectionData,
  addDoc,
  doc,
  updateDoc,
  getDoc
} from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-friends',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './friends.component.html',
  styleUrls: ['./friends.component.scss']
})
export class FriendsComponent implements OnInit {

  users: any[]    = [];
  requests: any[] = [];
  currentUserId   = '';

  private ns = inject(NotificationService);

  constructor(private firestore: Firestore, private auth: Auth) {}

  ngOnInit() {
    this.currentUserId = this.auth.currentUser?.uid || '';
    this.getUsers();
    this.getRequests();
  }

  getUsers() {
    collectionData(collection(this.firestore, 'users'), { idField: 'id' })
      .subscribe((users: any) => {
        this.users = users.filter((u: any) => u.id !== this.currentUserId);
      });
  }

  getRequests() {
    collectionData(collection(this.firestore, 'friendRequests'), { idField: 'id' })
      .subscribe((reqs: any) => { this.requests = reqs; });
  }

  // ── Enviar solicitud ── notifica al destinatario ──────────────────────────
  async sendRequest(toUserId: string) {
    const me = this.auth.currentUser;
    if (!me) return;

    const ref  = collection(this.firestore, 'friendRequests');
    const snap = await addDoc(ref, {
      from:      me.uid,
      to:        toUserId,
      status:    'pending',
      createdAt: new Date()
    });

    await this.ns.notifyFriendRequest({
      toUid:           toUserId,
      fromUid:         me.uid,
      fromName:        me.displayName || 'Usuario',
      fromAvatar:      me.photoURL    || '',
      friendRequestId: snap.id
    });
  }

  // ── Aceptar solicitud ── notifica al que la envió ─────────────────────────
  async acceptRequest(req: any) {
    const me = this.auth.currentUser;
    await updateDoc(doc(this.firestore, `friendRequests/${req.id}`), { status: 'accepted' });

    if (me) {
      await this.ns.notifyFriendAccepted({
        toUid:      req.from,
        fromUid:    me.uid,
        fromName:   me.displayName || 'Usuario',
        fromAvatar: me.photoURL    || ''
      });
    }
  }

  // ── Rechazar solicitud ────────────────────────────────────────────────────
  async rejectRequest(req: any) {
    await updateDoc(doc(this.firestore, `friendRequests/${req.id}`), { status: 'rejected' });
  }

  getRequestBetween(userId: string) {
    return this.requests.find(r =>
      (r.from === this.currentUserId && r.to === userId) ||
      (r.to   === this.currentUserId && r.from === userId)
    );
  }
}
