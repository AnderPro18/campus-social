export const environment = {
  firebase: {
    apiKey: "AIzaSyBi1T1oJzqR4JpNQfj0up3wUbDJVR599R8",
    authDomain: "campus-social-92d12.firebaseapp.com",
    projectId: "campus-social-92d12",
    storageBucket: "campus-social-92d12.firebasestorage.app",
    messagingSenderId: "329104707968",
    appId: "1:329104707968:web:fe47bb4f5d8d81935f7165",
    measurementId: "G-8WETVZ1SW9",
    vapidKey: "BAGXCwkZtIKnPMkx5L3jFBY3CCTSWH9gItkqI6N4wO8UIZcT-YxvLsULOzyZVAr0NuzGDSm181_ejlGwFU_71dA",
  },

   pushEndpointUrl: "https://campus-social-push.netlify.app/.netlify/functions/send-push",
 
  // Debe ser EXACTAMENTE el mismo valor que pusiste como PUSH_TRIGGER_SECRET
  // en las variables de entorno de Netlify.
  pushTriggerSecret: "kX8#mP2$vL9%nQ4&wR3*jZ7!fH5?bT",
};
