import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { provideRouter } from '@angular/router';
import { routes } from './app/app.routes';
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';
import { provideStorage, getStorage } from '@angular/fire/storage';
import { environment } from './environments/environment';
import { getRedirectResult } from '@angular/fire/auth';

import { provideHttpClient } from '@angular/common/http';  // <<--- AGREGAR ESTO

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    provideHttpClient(),                 // <<--- AGREGAR ESTO
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()),
    provideStorage(() => getStorage()),
  ],
}).then(async () => {
  try {
    const auth = getAuth();
    const res = await getRedirectResult(auth);
    if (res) {
      console.log('Redirect login result', res);
    }
  } catch (err) {
    console.error('Redirect processing error', err);
  }
}).catch(err => console.error(err));