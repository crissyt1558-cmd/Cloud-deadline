importScripts("https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDdmyDjgpOOu54uZZ0xR9_Yqj6FQDfMITM",
  authDomain: "duetrack-f2f53.firebaseapp.com",
  projectId: "duetrack-f2f53",
  storageBucket: "duetrack-f2f53.firebasestorage.app",
  messagingSenderId: "883900074594",
  appId: "1:883900074594:web:66a9963918fa220c3a9f3b",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  self.registration.showNotification(title || "DueTrack", {
    body: body || "You have a reminder",
  });
});
