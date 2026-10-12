// firebase-messaging-sw.js
// Debe vivir en la raíz servida (public/), NO dentro de src/app.
// Angular lo copia tal cual al build porque public/ se sirve como raíz estática.

importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js');

// ⚠️ Estos valores son públicos (igual que en environment.ts) — no son secretos.
// Si tu apiKey cambia, actualízalo aquí también; este archivo no puede
// importar desde environment.ts porque corre fuera del bundle de Angular.
firebase.initializeApp({
  apiKey: "AIzaSyBi1T1oJzqR4JpNQfj0up3wUbDJVR599R8",
  authDomain: "campus-social-92d12.firebaseapp.com",
  projectId: "campus-social-92d12",
  storageBucket: "campus-social-92d12.firebasestorage.app",
  messagingSenderId: "329104707968",
  appId: "1:329104707968:web:fe47bb4f5d8d81935f7165",
});

const messaging = firebase.messaging();

// Notificación cuando la app está en segundo plano / cerrada
messaging.onBackgroundMessage((payload) => {
  const { title, body, icon } = payload.notification || {};
  self.registration.showNotification(title || 'Campus Social', {
    body: body || 'Tienes una nueva notificación',
    icon: icon || '/icons/icon-192x192.png',
    data: payload.data,
  });
});

// Al hacer clic en la notificación, enfoca o abre la app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
      return undefined;
    })
  );
});
