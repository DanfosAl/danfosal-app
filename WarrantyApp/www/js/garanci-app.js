import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { signedIn } from './signin.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { firebaseConfig, announceConnection } from './garanci-shared.js';

export const app = getApps()[0] || initializeApp(firebaseConfig);
export const db = getFirestore(app);
const auth = getAuth(app);
// Only the owner's account gets in (firestore.rules): asked once on this computer, then remembered.
export const ready = signedIn(auth, { name: 'Danfos Garanci', lang: 'sq' });
export function showError(element, error) {
    console.error(error);
    announceConnection(navigator.onLine ? 'error' : 'offline');
    if (element) {
        element.hidden = false;
        element.setAttribute('role', 'alert');
        element.textContent = 'Të dhënat nuk u ngarkuan. Kontrolloni lidhjen dhe provoni përsëri.';
    }
}
