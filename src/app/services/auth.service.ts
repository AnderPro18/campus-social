import { Injectable } from '@angular/core';
import {
  Auth,
  OAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  user,
  authState
} from '@angular/fire/auth';
import { Observable } from 'rxjs';
import { filter, shareReplay } from 'rxjs/operators';
import { doc, Firestore, getDoc } from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  /**
   * user$ emite:
   *   - undefined  → Firebase Auth aún está inicializando (estado transitorio)
   *   - null       → no hay sesión activa
   *   - User       → sesión activa con datos del usuario
   *
   * El AuthGuard y el ChatService deben filtrar undefined antes de actuar.
   */
  user$: Observable<any>;

  /** Emite solo cuando hay un usuario real (null y undefined filtrados) */
  readonly authenticatedUser$: Observable<any>;

  constructor(
    private auth: Auth,
    private firestore: Firestore
  ) {
    // authState emite null/undefined al inicio y luego el User cuando Auth restaura sesión
    this.user$ = authState(this.auth);

    this.authenticatedUser$ = this.user$.pipe(
      filter(u => u != null),
      shareReplay(1)
    );

    // Mantener currentUserId sincronizado
    this.user$.subscribe(u => {
      this.currentUserId = u?.uid ?? null;
    });
  }

  /** Usuario de Firebase Auth (sincrónico) */
  get currentUser() {
    return this.auth.currentUser;
  }

  /** UID sincrónico — puede ser undefined si Auth aún inicializa */
  get currentUid(): string | undefined {
    return this.auth.currentUser?.uid;
  }

  /** UID sincrónico garantizado (lanza error si no hay sesión) */
  get currentUidOrThrow(): string {
    const uid = this.auth.currentUser?.uid;
    if (!uid) throw new Error('No hay sesión activa');
    return uid;
  }

  /** Último UID conocido, sincronizado por subscription */
  currentUserId: string | null = null;

  // ── Login ──────────────────────────────────────────────────────────────────
  async loginWithMicrosoftPopup() {
    const provider = new OAuthProvider('microsoft.com');
    provider.setCustomParameters({ prompt: 'select_account' });
    provider.addScope('User.Read');
    return await signInWithPopup(this.auth, provider);
  }

  async loginWithMicrosoftRedirect() {
    const provider = new OAuthProvider('microsoft.com');
    provider.setCustomParameters({ prompt: 'select_account' });
    provider.addScope('User.Read');
    await signInWithRedirect(this.auth, provider);
  }

  async handleRedirectResult() {
    try {
      return await getRedirectResult(this.auth);
    } catch (err) {
      console.error('Redirect result error', err);
      throw err;
    }
  }

  // ── Perfil ─────────────────────────────────────────────────────────────────
  async userProfileExists(uid: string) {
    const snap = await getDoc(doc(this.firestore, `users/${uid}`));
    return snap.exists();
  }

  async isProfileComplete(uid: string) {
    const snap = await getDoc(doc(this.firestore, `users/${uid}`));
    if (!snap.exists()) return false;

    const data: any = snap.data();
    const isStudent = (data['email'] || '').endsWith('@estudiante.uniajc.edu.co');
    const hasBasics = !!data['fechaNacimiento'] && !!data['ciudad'] && !!data['departamento'];

    if (!hasBasics) return false;
    return isStudent ? !!data['carrera'] : !!data['area'];
  }

  async logout() {
    return signOut(this.auth);
  }
}