# Danfos Garanci 1.1.0 — 13 September 2026

Implemented the approved dark concept in the installed Electron app: workspace
sidebar, floating warranty card, depth effects on service/machine/summary cards,
appearance controls, and automatic reduced-motion support. Local bundled fonts
and the new gold shield/warranty-card logo are included in the executable,
installer, application chrome and Windows shortcuts.

Added live service priorities, repair board, machine passports, appointment and
parts scheduling, intake notes/photos, repair costs and supplier reimbursement
tracking. Customer updates remain editable copyable drafts. The original
multi-machine issuing flow and shared Danfosal Firebase connection are retained.
All database edits receive a review/confirmation step. Concurrent field edits
are protected, and manual machines without serials retain their exact certificate
item through claims, completion and history.

Validation completed:

- Pure rules and per-item identity regression tests.
- Browser tests for all seven main views and compact layout.
- Issue/claim corrections, cancellation, duplicate prevention and conflicts.
- Service edits, repeated completion, compressed intake photos and photo count.
- Appearance persistence, pointer tilt, motion pause and reduced-motion support.
- Read-only live Electron check of all main views.
- Installed version 1.1.0 opens successfully and loads real records.
- All 36 packaged web assets plus main.js match the tested source byte for byte.
- QA fixtures, screenshots and backups are excluded from the application package.

Reinstalled successfully at:
`C:\Users\User\AppData\Local\Programs\Danfos Garanci\Danfos Garanci.exe`

Installer: `dist/Danfos Garanci Setup 1.1.0.exe`

SHA-256: `4ED0808105E45EA1864DC03CFA1CA6B66CB6175B1C46861DBEDBC4CE029CFDAA`

Source backup: `backups/before-modern-ui-20260910-133459`.
Pre-install local profile backup: `backups/profile-before-1.1.0-20260913`.
The previous 1.0.0 installer remains in dist. No production business records
were created or edited during verification.
