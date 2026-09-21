# Danfosal App: desktop app source

This folder is the main Electron app, and it is also where the EasyPOS OCR bridge
runs. For the big picture, see the [repository README](../../README.md). For
architecture and history, see [GOLDEN_MANIFEST.md](../../GOLDEN_MANIFEST.md).

## What's here

| Path | Purpose |
|---|---|
| `main.js`, `preload.js` | Electron entry point |
| `www/` | The app UI (every page). It is **also published to Firebase Hosting**, so put nothing private in it. |
| `www/index.html`, `www/app/` | **The new app** (redesign, Phase 1+): the shell (sidebar and Ctrl K search), the Today screen, the design system (`app.css`), the one Firebase setup (`firebase.js`) and the shared definitions of every number (`data.js`). New workspaces go here. |
| `www/stock.html`, `www/sell.html` | Rebuilt workspaces (Phase 2): Stock (catalogue, reorder, link receipt items) and Sell (all sales, the till). Each is a thin page; the logic is in `app/stock.js` / `app/sell.js` on top of `app/workspace.js`. |
| `www/customers.html`, `www/service.html` | Rebuilt workspaces (Phase 3): Customers (list with segments, profiles, merging lookalike names) and Service (repairs with Garanci's safe-save rule, warranty cards). Logic in `app/customers.js` / `app/service.js`. |
| `www/money.html`, `www/insights.html` | Rebuilt workspaces (Phase 4): Money (debts and payments) and Insights (charts with recording coverage marked, Export PDF via the `save-page-pdf` IPC). Logic in `app/money.js` / `app/insights.js`. |
| The other `www/*.html` pages | Classic screens not rebuilt yet: invoice import, online orders, order list, receive delivery, yearly plan, forecasts, expenses, creditors, settings and the admin tools. `warranty-card.html` is the print page Garanci and Service open. The 20 pages the new workspaces replaced were retired in Phase 5 (quarantined, and redirected on Hosting in `firebase.json`). |
| `easypos-ocr-bridge.js` | EasyPOS OCR bridge. The watchdog runs it from here, by absolute path, so **do not move it**. |
| `start-bridge-hidden.vbs` | Hidden launcher the watchdog uses to start the bridge |
| `firebase-admin-config.js` | Shared Admin SDK setup for the bridge and data tools; reads `serviceAccountKey.json` |
| `scripts/data/` | Firestore command-line tools. Run them through npm (see below). |
| `scripts/deploy/`, `scripts/android/`, `scripts/maintenance/` | Release, Android and backup scripts. Each one sets its own working directory. |
| `functions/` | The Cloud Function `instagramWebhook`. It is **live in production**. |
| `android/`, `capacitor.config.ts`, `ionic.config.json` | Capacitor Android project |
| `build/installer.nsh` | NSIS hook that closes a running copy before installing |
| `www/assets/danfosal-logo.svg` | App logo source. After changing it, run `node build/make-icon.cjs` to regenerate `build/icon.ico` and the window PNG. |
| `tailwind-configs/` | Tailwind sources, compiled into `www/css/` by `npm run build:css` |
| `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json` | Firebase project configuration |
| `app-version.json`, `update-manifest.json` | Update manifests (Android OTA and desktop) |

**Local only, never committed:** `serviceAccountKey.json` (database admin access) and
the two `*.keystore` files (Android signing keys, which cannot be replaced; back them up separately).

## Commands

```bash
npm install                 # first time, or after a dependency change
npm start                   # run the app from source
npm run dist                # build dist/Danfosal App Setup <version>.exe
npm run inspect-data        # also: audit-customers, merge-duplicates, verify-invoice,
                            #       view-customer, loyalty-dashboard
firebase deploy --only hosting
```

`npm run bridge` runs the OCR bridge in the foreground for debugging. **Stop the
watchdog-managed bridge first**, or two bridges will process the same receipts.
