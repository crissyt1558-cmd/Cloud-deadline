import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDdmyDjgpOOu54uZZ0xR9_Yqj6FQDfMITM",
  authDomain: "duetrack-f2f53.firebaseapp.com",
  projectId: "duetrack-f2f53",
  storageBucket: "duetrack-f2f53.firebasestorage.app",
  messagingSenderId: "883900074594",
  appId: "1:883900074594:web:66a9963918fa220c3a9f3b",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
