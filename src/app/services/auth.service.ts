import { Injectable } from '@angular/core';
import {
  Auth,
  OAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  getRedirectResult,
  signOut,
  user,
  authState,
} from '@angular/fire/auth';
import { Observable } from 'rxjs';
import { filter, shareReplay } from 'rxjs/operators';
import { doc, Firestore, getDoc, serverTimestamp, setDoc } from '@angular/fire/firestore';

export class AccountCreatedProfileSetupError extends Error {
  constructor(readonly originalError: unknown) {
    super('La cuenta se creó, pero no se pudo completar la configuración del perfil.');
    this.name = 'AccountCreatedProfileSetupError';
  }
}

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

  async registerWithEmailAndPassword(displayName: string, email: string, password: string) {
    const credential = await createUserWithEmailAndPassword(this.auth, email, password);

    let profileSetupError: unknown;
    try {
      await updateProfile(credential.user, { displayName });
    } catch (error) {
      profileSetupError = error;
    }

    try {
      await setDoc(doc(this.firestore, `users/${credential.user.uid}`), {
        displayName,
        email: credential.user.email,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      profileSetupError ??= error;
    }

    if (profileSetupError) {
      throw new AccountCreatedProfileSetupError(profileSetupError);
    }

    return credential;
  }

  async loginWithEmailAndPassword(email: string, password: string) {
    return signInWithEmailAndPassword(this.auth, email, password);
  }

  getEmailAuthErrorMessage(error: unknown): string {
    const code =
      typeof error === 'object' && error !== null && 'code' in error &&
      typeof error.code === 'string'
        ? error.code
        : '';

    let message: string;
    switch (code) {
      case 'auth/email-already-in-use':
        message = 'Ya existe una cuenta con ese correo. Intenta iniciar sesión.';
        break;
      case 'auth/invalid-email':
        message = 'El correo electrónico no es válido.';
        break;
      case 'auth/weak-password':
        message = 'La contraseña debe tener al menos 6 caracteres.';
        break;
      case 'auth/operation-not-allowed':
      case 'auth/admin-restricted-operation':
        message = 'Firebase no permite crear cuentas con correo y contraseña. Habilita ese proveedor en Authentication > Sign-in method del proyecto Campus Social.';
        break;
      case 'auth/configuration-not-found':
        message = 'Firebase Authentication no tiene un proveedor de acceso configurado. Habilita Correo/contraseña en el proyecto Campus Social.';
        break;
      case 'auth/invalid-api-key':
      case 'auth/api-key-not-valid':
        message = 'La configuración de Firebase no es válida. Revisa el proyecto y su clave de API.';
        break;
      case 'auth/app-not-authorized':
        message = 'Esta aplicación web no está autorizada para usar Firebase Authentication en el proyecto configurado.';
        break;
      case 'auth/invalid-credential':
      case 'auth/invalid-login-credentials':
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        message = 'El correo o la contraseña son incorrectos.';
        break;
      case 'auth/too-many-requests':
        message = 'Hubo demasiados intentos. Espera un momento y vuelve a intentarlo.';
        break;
      case 'auth/network-request-failed':
        message = 'No se pudo conectar con Firebase. Revisa tu conexión e inténtalo de nuevo.';
        break;
      case 'permission-denied':
      case 'firestore/permission-denied':
        message = 'Firebase Authentication creó la cuenta, pero Firestore rechazó guardar el perfil. Revisa las reglas de Firestore.';
        break;
      case 'unavailable':
      case 'firestore/unavailable':
        message = 'La cuenta se creó, pero Firestore no está disponible ahora para guardar el perfil.';
        break;
      default:
        message = 'Firebase rechazó la operación. Revisa el código de error y la consola del navegador.';
    }

    return code ? `${message} (Código: ${code})` : `${message} (Firebase no devolvió un código de error.)`;
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