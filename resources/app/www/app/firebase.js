// One Firebase setup for the app: same project and SDK version (11.6.1) as Danfos Garanci and the
// print page. Firestore lets in only the owner's account (firestore.rules), so the app signs in
// with the owner's email and password once per device (signin.js) and stays signed in there.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { signedIn, signOutHere } from './signin.js';
import {
    getFirestore, collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, setDoc,
    increment, arrayUnion, arrayRemove, Timestamp, writeBatch, runTransaction, query, where, orderBy, deleteField, onSnapshot
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
export { collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, setDoc, increment, arrayUnion, arrayRemove, Timestamp, writeBatch, runTransaction, query, where, orderBy, deleteField, onSnapshot };

// Resolves once the owner is signed in (the form shows only when this device isn't yet). Every read
// waits on this.
export const ready = signedIn(auth, { name: 'Danfosal App', lang: 'en' });
export const signOut = () => signOutHere(auth);
