import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyC_UFzvlqvfzyCailaqLqjT3hwHPzfuYn8",
  authDomain: "fairway-rival.firebaseapp.com",
  projectId: "fairway-rival",
  storageBucket: "fairway-rival.firebasestorage.app",
  messagingSenderId: "180086077696",
  appId: "1:180086077696:web:7a1dd7dd5a2e436f2c1be5",
  measurementId: "G-RK8RJLZ6JE"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
