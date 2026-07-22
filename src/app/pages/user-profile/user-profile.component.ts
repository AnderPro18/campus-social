import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Firestore, doc, getDoc, collection, query, where, getDocs, orderBy } from '@angular/fire/firestore';
import { AuthService } from '../../services/auth.service';
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

  profileUser: any = null;
  posts: any[] = [];
  reels: any[] = [];
  loading = true;
  notFound = false;

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

      if (me?.uid === uid) {
        this.router.navigate(['/profile']);
        return;
      }

      await this.loadProfile(uid);

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