import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { provideRouter } from '@angular/router';
import { routes } from './app/app.routes';
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';
import { provideStorage, getStorage } from '@angular/fire/storage';
import { provideMessaging, getMessaging } from '@angular/fire/messaging'; // ← NUEVO
import { environment } from './environments/environment';
import { getRedirectResult } from '@angular/fire/auth';

import { provideHttpClient } from '@angular/common/http';
import { isDevMode } from '@angular/core';
import { provideServiceWorker } from '@angular/service-worker';

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    provideHttpClient(),
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()),
    provideStorage(() => getStorage()),
    provideMessaging(() => getMessaging()),   // ← NUEVO (esto es lo que faltaba)
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    }),
    // (se quitaron las 2 llamadas duplicadas a provideServiceWorker que
    // había antes — no rompían nada, pero registraban el service worker
    // tres veces innecesariamente)
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