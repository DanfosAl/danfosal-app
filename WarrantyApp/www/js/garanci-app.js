import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { firebaseConfig, announceConnection } from './garanci-shared.js';

export const app = getApps()[0] || initializeApp(firebaseConfig);
export const db = getFirestore(app);
const auth = getAuth(app);
export const ready = new Promise((resolve, reject) => {
    let signingIn = false;
    onAuthStateChanged(auth, user => {
        if (user) { resolve(user); }
        else if (!signingIn) {
            signingIn = true;
            signInAnonymously(auth).catch(error => { announceConnection('error'); reject(error); });
        }
    }, reject);
});
export function showError(element, error) {
    console.error(error);
    announceConnection(navigator.onLine ? 'error' : 'offline');
    if (element) {
        element.hidden = false;
        element.setAttribute('role', 'alert');
        element.textContent = 'Të dhënat nuk u ngarkuan. Kontrolloni lidhjen dhe provoni përsëri.';
    }
}
