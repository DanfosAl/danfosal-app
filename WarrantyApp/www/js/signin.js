// The owner's sign-in, once per device.
//
// Firestore lets in only the owner's account (firestore.rules), so every page waits here before it
// reads anything. The first time on a device - this PC's app, the phone, a browser - it asks for
// the email and password; Firebase then keeps the session on the device (local persistence:
// IndexedDB) until "Sign out", so it doesn't ask again. A session left over from the old anonymous
// sign-in is signed out and replaced by the owner's.
//
// The same file is used by Danfos Garanci (WarrantyApp/www/js/signin.js is a copy) and by
// warranty-card.html. No styles from the page are needed: the form carries its own.
import {
    onAuthStateChanged, signInWithEmailAndPassword, sendPasswordResetEmail, signOut, setPersistence, browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';

const TEXT = {
    en: { sub: 'Only the owner’s account opens the app. You stay signed in on this device.', email: 'Email', password: 'Password', go: 'Sign in',
        busy: 'Signing in…', forgot: 'Forgot the password?', sent: 'A link to set a new password was sent to {email}.', needEmail: 'Enter your email first.',
        wrong: 'Wrong email or password.', many: 'Too many tries. Wait a minute and try again.', offline: 'No internet connection.', other: 'Couldn’t sign in: ' },
    sq: { sub: 'Vetëm llogaria e pronarit e hap aplikacionin. Mbeteni i kyçur në këtë pajisje.', email: 'Email', password: 'Fjalëkalimi', go: 'Hyr',
        busy: 'Duke hyrë…', forgot: 'Keni harruar fjalëkalimin?', sent: 'Një lidhje për fjalëkalim të ri u dërgua te {email}.', needEmail: 'Shkruani më parë email-in.',
        wrong: 'Email ose fjalëkalim i gabuar.', many: 'Shumë përpjekje. Prisni një minutë dhe provoni përsëri.', offline: 'Nuk ka lidhje interneti.', other: 'Hyrja dështoi: ' }
};
const LAST = 'danfosal-signin-email';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Resolves with the signed-in owner. name: the app's name on the form; lang: 'en' or 'sq'.
export function signedIn(auth, { name = 'Danfosal App', lang = 'en' } = {}) {
    const t = TEXT[lang] || TEXT.en;
    return new Promise(resolve => {
        let box = null, done = false;
        onAuthStateChanged(auth, async user => {
            if (done) return;
            if (user && !user.isAnonymous) { done = true; if (box) box.remove(); resolve(user); return; }
            if (user && user.isAnonymous) { await signOut(auth).catch(() => {}); return; }
            if (!box) box = form();
        });

        function form() {
            let last = ''; try { last = localStorage.getItem(LAST) || ''; } catch { /* private window */ }
            const el = document.createElement('div');
            el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'si-title');
            el.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:16px;background:#0b0d18;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#e9e9f5';
            el.innerHTML = `
                <form style="width:min(380px,100%);background:#141728;border:1px solid #2a2e48;border-radius:14px;padding:26px 24px;box-shadow:0 30px 80px -30px rgba(0,0,0,.8)" novalidate>
                    <h1 id="si-title" style="margin:0 0 6px;font-size:22px;font-weight:600">${esc(name)}</h1>
                    <p style="margin:0 0 20px;color:#9092ad;font-size:13.5px;line-height:1.4">${esc(t.sub)}</p>
                    <label style="display:block;font-size:12.5px;color:#9092ad;margin-bottom:5px" for="si-email">${esc(t.email)}</label>
                    <input id="si-email" type="email" autocomplete="username" required value="${esc(last)}" style="${field}">
                    <label style="display:block;font-size:12.5px;color:#9092ad;margin:12px 0 5px" for="si-pass">${esc(t.password)}</label>
                    <input id="si-pass" type="password" autocomplete="current-password" required style="${field}">
                    <p id="si-msg" role="alert" style="min-height:18px;margin:10px 0 0;font-size:13px;color:#f08a8a"></p>
                    <button id="si-go" type="submit" style="width:100%;margin-top:8px;padding:11px;border:0;border-radius:9px;background:#8b5cf6;color:#fff;font-size:15px;font-weight:600;cursor:pointer">${esc(t.go)}</button>
                    <button id="si-forgot" type="button" style="width:100%;margin-top:10px;padding:6px;border:0;background:none;color:#9092ad;font-size:12.5px;cursor:pointer;text-decoration:underline">${esc(t.forgot)}</button>
                </form>`;
            document.body.appendChild(el);
            const $ = id => el.querySelector('#' + id), msg = $('si-msg');
            const say = (text, ok) => { msg.style.color = ok ? '#7fd8a8' : '#f08a8a'; msg.textContent = text; };
            const why = e => /invalid-credential|wrong-password|user-not-found|invalid-email|user-disabled/.test(e.code || '') ? t.wrong
                : /too-many-requests/.test(e.code || '') ? t.many : /network/.test(e.code || '') ? t.offline : t.other + (e.code || e.message);
            (last ? $('si-pass') : $('si-email')).focus();
            el.querySelector('form').addEventListener('submit', async ev => {
                ev.preventDefault();
                const email = $('si-email').value.trim(), pass = $('si-pass').value;
                if (!email || !pass) { say(t.needEmail); return; }
                const go = $('si-go'); go.disabled = true; go.textContent = t.busy; say('');
                try {
                    await setPersistence(auth, browserLocalPersistence);
                    await signInWithEmailAndPassword(auth, email, pass);
                    try { localStorage.setItem(LAST, email); } catch { /* fine */ }
                } catch (e) { say(why(e)); go.disabled = false; go.textContent = t.go; $('si-pass').select(); }
            });
            $('si-forgot').addEventListener('click', async () => {
                const email = $('si-email').value.trim();
                if (!email) { say(t.needEmail); $('si-email').focus(); return; }
                try { await sendPasswordResetEmail(auth, email); say(t.sent.replace('{email}', email), true); }
                catch (e) { say(why(e)); }
            });
            return el;
        }
    });
}

const field = 'width:100%;box-sizing:border-box;padding:10px 12px;border-radius:9px;border:1px solid #2a2e48;background:#0f1120;color:#e9e9f5;font-size:15px;outline-color:#8b5cf6';

// Sign out on this device; the page reloads to the sign-in form.
export async function signOutHere(auth) { await signOut(auth); location.reload(); }
