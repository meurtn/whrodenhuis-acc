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
  apiKey:            "AIzaSyAPjhEJGMwkO2Yx_1PY51XeY6bJH74rHZY",
  authDomain:        "whrodenhuis-t1.firebaseapp.com",
  projectId:         "whrodenhuis-t1",
  messagingSenderId: "839535792366",
  appId:             "1:839535792366:web:f45c188319e5ca72fee3ff"
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
