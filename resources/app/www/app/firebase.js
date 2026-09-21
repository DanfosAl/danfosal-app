// One Firebase setup for the new app. The classic pages each carry their own copy of this;
// new screens import it from here instead. Same project, same SDK version (11.6.1) and the
// same anonymous sign-in as everything else, so Firestore rules apply identically.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import {
    getFirestore, collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, setDoc,
    increment, arrayUnion, arrayRemove, Timestamp, writeBatch, runTransaction
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

export const firebaseConfig = {
    apiKey: 'AIzaSyDUtblUqNiSCmC4kRjikE7D2kba0Mhxej4',
    authDomain: 'danfosal-app.firebaseapp.com',
    projectId: 'danfosal-app',
    storageBucket: 'danfosal-app.appspot.com',
    messagingSenderId: '565855692028',
    appId: '1:565855692028:web:c7cb647497cb3df9452379',
    measurementId: 'G-50JPG2KKEC'
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export { collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, setDoc, increment, arrayUnion, arrayRemove, Timestamp, writeBatch, runTransaction };

// Resolves once signed in. Firestore rules require an authenticated user, so every read waits on this.
export const ready = new Promise((resolve, reject) => {
    const stop = onAuthStateChanged(auth, user => {
        if (user) { stop(); resolve(user); }
    });
    signInAnonymously(auth).catch(reject);
});
