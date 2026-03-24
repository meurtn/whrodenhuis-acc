// ─────────────────────────────────────────────────────────────────────────────
// admin/firebase-config-admin.js
// Firebase + Cloudinary configuratie voor de beheertool.
// Bereikbaar via /admin/ - beveiligd met Google Auth (alleen geautoriseerde
// Google-accounts kunnen inloggen, ook al kent iemand de URL).
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp }  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore,
  collection, getDocs, addDoc, setDoc,
  doc, getDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  getAuth,
  signOut, onAuthStateChanged,
  signInWithEmailAndPassword,
  GoogleAuthProvider, signInWithPopup
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

// ─── FIREBASE CONFIG ─────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};
// ─────────────────────────────────────────────────────────────────────────────

// ─── CLOUDINARY CONFIG ───────────────────────────────────────────────────────
export const CLOUDINARY = {
  cloudName:    'dp6nzxyr1',
  uploadPreset: 'whrodenhuis-t1',
  folder:       'paintings',
  uploadUrl:    'https://api.cloudinary.com/v1_1/dp6nzxyr1/image/upload'
};
// ─────────────────────────────────────────────────────────────────────────────

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

window._fb = {
  db, auth,
  // Firestore
  collection, getDocs, addDoc, setDoc,
  doc, getDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp,
  // Auth
  signOut, onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithGoogle: () => signInWithPopup(auth, googleProvider)
};
