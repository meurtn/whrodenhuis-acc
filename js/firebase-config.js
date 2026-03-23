// ─────────────────────────────────────────────────────────────────────────────
// firebase-config.js
// Pas ALLEEN dit bestand aan met uw eigen Firebase-projectgegevens.
// Zoek deze waarden op via: Firebase Console → Project Settings → Your apps
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore, collection, getDocs, addDoc, setDoc,
  doc, getDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  getStorage, ref, uploadBytes, getDownloadURL, deleteObject
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

// ─── VUL HIER UW GEGEVENS IN ─────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyCdE5CQpB3DNXKroCiumqzQCZ2bKpnk0TU",
  authDomain:        "whrodenhuis-acc.firebaseapp.com",
  projectId:         "whrodenhuis-acc",
  storageBucket:     "whrodenhuis-acc.firebasestorage.app",
  messagingSenderId: "412680715738",
  appId:             "1:412680715738:web:15938d1ba63de49da454e3"
};
// ─────────────────────────────────────────────────────────────────────────────

const app     = initializeApp(firebaseConfig);
const db      = getFirestore(app);
const storage = getStorage(app);
const auth    = getAuth(app);

// Exposed globally so app.js (non-module) can access Firebase
window._fb = {
  db, storage, auth,
  // Firestore methods
  collection, getDocs, addDoc, setDoc,
  doc, getDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp,
  // Storage methods
  ref, uploadBytes, getDownloadURL, deleteObject,
  // Auth methods
  signInWithEmailAndPassword, signOut, onAuthStateChanged
};
