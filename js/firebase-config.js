// ─────────────────────────────────────────────────────────────────────────────
// js/firebase-config.js  -  PUBLIEKE SITE
// Alleen Firestore voor het lezen van schilderijen, reviews en het opslaan
// van contactberichten. Geen auth, geen storage - die zitten in de admin tool.
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore,
  collection, getDocs, addDoc, setDoc,
  doc, getDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ─── VUL HIER UW GEGEVENS IN ─────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyAPjhEJGMwkO2Yx_1PY51XeY6bJH74rHZY",
  authDomain:        "whrodenhuis-t1.firebaseapp.com",
  projectId:         "whrodenhuis-t1",
  messagingSenderId: "839535792366",
  appId:             "1:839535792366:web:f45c188319e5ca72fee3ff"
  // storageBucket niet nodig - upload gaat via Cloudinary
};
// ─────────────────────────────────────────────────────────────────────────────

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

window._fb = {
  db,
  collection, getDocs, addDoc, setDoc,
  doc, getDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp
};