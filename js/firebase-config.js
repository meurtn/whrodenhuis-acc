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
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
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
