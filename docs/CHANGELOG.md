#  CHANGELOG - Danfosal App

**Project:** Danfosal Business Intelligence App  
**Version:** 1.4.1  
**Last Updated:** September 14, 2026

---

## [Maintenance] - 2026-09-14 - Repository cleanup

Full details are in GOLDEN_MANIFEST.md, Finding #22.

### Quarantined (reversible: `E:\DanfosalApp_QUARANTINE_2026-09-14\`)
- 3.1 GB and 26,535 files: old installers and `win-unpacked/`, the unused in-repo Android SDK (619 MB), the Electron runtime unpacked into the repo root, an empty Python venv, 13 one-off fix scripts, the retired weekly-report scheduler and its SMTP config, and accidental `start`/`stop`/`query` files

### Reorganized
- All docs are now in `docs/guides/`, `docs/archive/` and `docs/records/` (the last is local only)
- `resources/app` scripts are now in `scripts/{data,deploy,android,maintenance}/`, with require paths and `package.json` updated and a working-directory guard in every PowerShell script
- The Garanci design handoff moved to `WarrantyApp/docs/design-handoff/`

### Security
- Removed a customer sales spreadsheet (names and phone numbers) that Firebase Hosting was serving publicly from `www/`
- Hosting now ignores `*.md`, `*.xlsx`, `*.xls` and `*.csv`
- `.gitignore` now blocks keystores, SMTP credentials and business data, since the GitHub remote is public

---

## [1.3.1] - 2026-01-08

### ?? Security & Authentication
- **CRITICAL FIX:** Implemented Firebase Authentication across all 26 files
- Deployed Firestore security rules: `if request.auth != null`
- Added `onAuthStateChanged` listeners to prevent race conditions
- Anonymous authentication working across all platforms

###  Bug Fixes
- Fixed ReferenceError issues with global variables
- Fixed ES6 module scope problems (87+ references updated)
- Fixed invalid date handling in business intelligence
- Fixed ticker bar data population
- Fixed Smart Dashboard loading race condition

### ? Performance Optimizations
- Eliminated 300+ redundant Firestore queries in Smart Dashboard
- Implemented event-driven ticker updates
- Synchronized authentication with data loading

###  Configuration
- Corrected API keys across 10+ files
- Standardized Firebase SDK to version 11.6.1

###  Repository Maintenance
- **COMPLETED:** Removed ~2.4GB unused JDK folders (jdk-11.0.2, jdk-17, jdk-17.0.8+7)
- **COMPLETED:** Removed ~640MB zip files (openjdk*.zip, cmdline-tools.zip)
- **COMPLETED:** Deleted 4 junk files (Comands.txt, New Text Document.txt, etc.)
- **COMPLETED:** Organized 43 documentation files into structured docs/ hierarchy
  - 21 active guides and 22 archived files, which the 2026-09-14 cleanup consolidated into `docs/guides/` and `docs/archive/`
- **COMPLETED:** Created professional CHANGELOG.md for version tracking
- **COMPLETED:** Created automated daily Firestore backups (scheduled 2:00 AM)
- **COMPLETED:** Updated .gitignore with build artifact exclusions
- **Total Space Saved:** ~3.25GB

---

## [1.3.0] - 2025-11-XX

###  Features
- AI-powered demand forecasting
- Smart inventory scanner with OCR
- Business intelligence dashboard
- Instagram order synchronization

---

**For detailed documentation, see:**
- [GOLDEN_MANIFEST.md](../GOLDEN_MANIFEST.md) - Master reference
- [January 2026 cleanup plan](archive/REPOSITORY_CLEANUP_PLAN_2026-01.md) - Superseded by Finding #22
- [guides/](guides/) - User guides
- [archive/](archive/) - Historical documentation

**END OF CHANGELOG**
