# Danfosal App

Business management system for **Danfos Sh.P.K**, a Kärcher reseller in Albania.
It covers sales, stock, customers, suppliers, debts, and service and warranty work,
all backed by one Firebase Firestore project (`danfosal-app`).

> **Start with [GOLDEN_MANIFEST.md](GOLDEN_MANIFEST.md).** It is the authoritative
> technical reference: architecture, data model, every known issue and fix.

## Repository layout

| Path | What it is |
|---|---|
| [`resources/app/`](resources/app/) | **Danfosal App**, the main Electron desktop app. The EasyPOS OCR bridge also runs from here. |
| [`WarrantyApp/`](WarrantyApp/) | **Danfos Garanci**, a standalone Electron app for issuing warranties and registering claims. It uses the same Firestore project. |
| [`tools/easypos-print-capture/`](tools/easypos-print-capture/) | A .NET Windows service that captures EasyPOS fiscal receipts for the OCR bridge. |
| [`docs/`](docs/) | `guides/` (how-tos), `archive/` (historical notes), `records/` (local only, never committed) |
| `DanfosalStartup.bat`, `run-startup-hidden.vbs` | The EasyPOS pipeline watchdog. Task Scheduler runs it silently every 30 minutes. |

`resources/app` is a historical path that mirrors an Electron install layout. It stays
put because the print-capture service, the watchdog and the scheduled task all
reference it by absolute path.

## How the EasyPOS pipeline works

```
EasyPOS prints a receipt
  -> print-capture service (Windows service "DanfosEasyPOSCapture")
       writes PNG + JSON to C:\Danfosal\Inbox\EasyPOS
  -> OCR bridge (resources/app/easypos-ocr-bridge.js, Node)
       reads the receipt, matches products, saves to storeSales, deducts stock
  -> Danfosal App and Danfos Garanci read it from Firestore
```

The watchdog keeps the service and the bridge running. When the bridge's code changes,
the watchdog restarts it within 30 minutes, but only while the inbox is empty.

## What a change requires

| You changed | You need to |
|---|---|
| `resources/app/www/**` | Rebuild and reinstall Danfosal App, **and** redeploy Hosting. Garanci's certificate print page is served from Hosting. |
| `easypos-ocr-bridge.js` or the watchdog scripts | Nothing. The watchdog picks the change up within 30 minutes. |
| `WarrantyApp/www/**` | Rebuild and reinstall Danfos Garanci |
| `resources/app/functions/` | `firebase deploy --only functions` |

## Common commands

Run these from `resources/app/` (or `WarrantyApp/` for Garanci):

```bash
npm install                         # first time, or after a dependency change
npm run dist                        # build the installer into dist/
firebase deploy --only hosting      # publish www/ to danfosal-app.web.app
npm run inspect-data                # data tools: see "scripts" in package.json
```

Deploy, Android and maintenance scripts are in `resources/app/scripts/`. Each one
sets its own working directory, so you can launch it from anywhere.

## Never commit

The GitHub remote is **public**. `.gitignore` blocks the following. Keep it that way:

- `serviceAccountKey.json`: full admin access to the database
- `*.keystore`: Android signing keys, which cannot be replaced. Back them up separately.
- Customer, sales, cost or stock exports (`*.xlsx`, `*.csv`, `docs/records/`)
- SMTP credentials (`config/email-config.json`)
