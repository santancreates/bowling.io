import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBkYVHaeXW7q9V1hYJZkxVn4bulcDKR27w",
  authDomain: "bowling-io.firebaseapp.com",
  projectId: "bowling-io",
  storageBucket: "bowling-io.firebasestorage.app",
  messagingSenderId: "266335326459",
  appId: "1:266335326459:web:b8907a31fa405b1d20605e"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

export function ensureAnonAuth() {
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, async (user) => {
      if (user) return resolve(user);
      try {
        const cred = await signInAnonymously(auth);
        resolve(cred.user);
      } catch (e) { reject(e); }
    });
  });
}
