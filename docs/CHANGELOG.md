#  CHANGELOG - Danfosal App

**Project:** Danfosal Business Intelligence App  
**Version:** 1.4.11  
**Last Updated:** November 19, 2026

---

## [Released] - 2026-11-19 - Customers › Phone numbers (version 1.4.11)

Full details are in GOLDEN_MANIFEST.md, Finding #86.

### Added
- Customers › Phone numbers: customers without a phone, and the number they typed in an Instagram chat - Add in one click, or Not them

---

## [Released] - 2026-11-19 - Cash with the courier, Instagram on the customer's page, the bot's report card, same time last year (version 1.4.10)

Full details are in GOLDEN_MANIFEST.md, Finding #85.

### Added
- Sell › Online orders: Cash with the courier - shipped or delivered orders not yet paid, with a Paid button; Today shows the total
- Customers: a customer's Instagram chats, with Open chat
- Sell › Instagram › Bot report card: per week, the bot's orders kept as written, corrected (which field) or deleted
- Stock › Next order: what people asked about at this time last year

---

## [Released] - 2026-11-19 - A smarter Instagram bot: agreed prices, learned words, checks, health, demand rising, post ideas (version 1.4.9)

Full details are in GOLDEN_MANIFEST.md, Finding #84.

### Added
- Bot orders carry the price you agreed in the chat (and the courier fee you told the customer); the order shows the catalogue price beside it
- Sell › Instagram › Asked for: "This means…" teaches the bot a customer's word for a product; correcting a bot order teaches it too
- Online orders: a Check label on bot orders worth a second look (one name, no town, Kosovo, odd phone, product to fill in, a second order today)
- Today: a warning when the Instagram bot can't read orders (e.g. AI credit used up) or hasn't received a message for 3 days
- Stock › Next order and Asked for: products asked about more than usual lately
- Sell › Instagram › Post ideas: what to post this week, with a caption to copy

---

## [Released] - 2026-11-19 - Instagram: bought before, the chat behind a bot order, how follow-ups ended (version 1.4.8)

Full details are in GOLDEN_MANIFEST.md, Finding #83.

### Added
- Sell › Instagram › Follow up: "Bought before as …" when the person writing is already a customer - purchases, the last one, warranties still running
- Online orders: a bot order shows the Instagram messages it came from, to check the name, phone and address
- Follow up: Done asks how it ended (sold, too expensive, bought elsewhere, no stock, no reply, other), and the panel shows the totals for 90 days

---

## [Released] - 2026-11-19 - Instagram: back in stock, idle stock offers, asked for, where chats come from, answer speed (version 1.4.7)

Full details are in GOLDEN_MANIFEST.md, Finding #82.

### Added
- Sell › Instagram › Back in stock: people who asked for something while it was out of stock, now that it's back - with a ready message and Open chat; Today counts them
- Sell › Instagram › Offer idle stock: stock that hasn't sold in 90 days and the people who asked about it
- Sell › Instagram › Asked for: every product question per product - in stock, out of stock, not in your catalogue
- Sell › Instagram › Where chats come from (ads, story replies, shared posts, links) and Answer speed against orders
- Stock › Next order: Instagram questions count for every product, and a list of what people ask for that isn't in the catalogue

---

## [Released] - 2026-11-19 - Sell › Instagram: Private accounts (version 1.4.6)

Full details are in GOLDEN_MANIFEST.md, Finding #81.

### Added
- Sell › Instagram: Private on a Follow up row or on anyone in the People list - the bot then ignores that account (stores, reads and logs nothing) until you press Not private
- A Private chats panel: every account the bot ignores, whether you or the bot decided, and Not private to undo

---

## [Released] - 2026-11-19 - Sell › Instagram: Follow up (version 1.4.5)

Full details are in GOLDEN_MANIFEST.md, Finding #81.

### Added
- Sell › Instagram: a Follow up panel from the Instagram bot's reading of each chat - customers waiting for your answer, and customers who went quiet after you answered a product question - with the summary, the next step, the products with price and stock, Open chat, Add as order and Done
- Instagram usernames instead of "visitor 12345" where the bot knows them
- Today: an item when Instagram customers are waiting for your answer

---

## [Released] - 2026-11-18 - The phone app updates itself for real (version 1.4.4)

Full details are in GOLDEN_MANIFEST.md, Finding #80.

### Fixed
- Android: the live update never ran on a real phone (it looked for registerPlugin, which the Android runtime doesn't provide); it now calls the plugin through the runtime's own bridge. Each phone installs the 1.4.4 APK once.
- Settings: Check for updates no longer says "You have the latest version" when it doesn't know

---

## [Released] - 2026-11-18 - Stock › Next order: one proposal for the next Kärcher order, Excel for the order page (version 1.4.3)

Full details are in GOLDEN_MANIFEST.md, Finding #79.

### Added
- Stock › Next order (replaces Reorder, same address): one proposal from what runs out within the 6-week restock, what is out of stock but sold or asked for, and the yearly plan at its real pace, less what is on the shelf and the order list; quantities to change, lines to untick, products to add; the total at Kärcher's prices and the cash it takes with customs
- One click puts the proposal on the order list; those lines download as an Excel file (Name, SKU, Quantity) to type into Kärcher's order page, and can be marked as placed
- Kärcher's order confirmation: the delivery date per line is read and shown on the order list ("due 19 Nov", "was due", "not confirmed yet") and on Today ("lines from Kärcher due this week")

### Changed
- Paper Autopilot: a filed Kärcher order gives its number to the lines already planned for those products instead of adding a second line; `--reread-orders` re-reads the order papers already filed

---

## [Released] - 2026-11-18 - Every device updates itself (version 1.4.2)

Full details are in GOLDEN_MANIFEST.md, Finding #78.

### Added
- Desktop app: updates itself from GitHub Releases (checks at start and every 4 hours, downloads only what changed, installs on close or Restart now)
- Phone app: new screens download in the background and are used from the next start; a release that needs a new APK shows an Install bar
- Settings: the version, and Check for updates on desktop and phone
- tools/release/release.mjs: one command builds and publishes a release to every device

### Changed
- Every release now has its own version (1.4.2 is the first); the installer is named Danfosal-App-Setup-<version>.exe
- Android: compiled against SDK 35; needs Android 6.0 or newer

---

## [Released] - 2026-11-18 - easyPOS e-invoices into Sales; Kärcher order confirmations and part payments (desktop 1.4.1 rebuild, web, Android)

Full details are in GOLDEN_MANIFEST.md, Findings #76 and #77.

### Added
- Check Downloads now: e-invoices made in easyPOS ("Faturë Elektronike") go into Sales like the Platforma's; one in lek at easyPOS's own rate from the latest till receipt
- Check Downloads now: Kärcher Zagreb's "Order Confirmation" is filed under Kärcher/Orders, read into Purchases and put on the order list
- EasyPOS bridge: keeps the till's lek rate on every till sale

### Fixed
- Sell › Import invoice: the reader no longer crashes on an invoice whose buyer block has no "Emri:" line
- Purchases: a part payment against an order ("Pagesë pjesëshme ...") leaves the rest of the invoice open instead of counting it as paid
- easyPOS e-invoices are filed with their total in the name

---

## [Released] - 2026-10-24 - Suggested selling prices and the EasyPOS price list (desktop 1.4.1 rebuild, web, Android)

Full details are in GOLDEN_MANIFEST.md, Finding #75.

### Added
- Stock › Prices: a suggested price for every product from its cost, the running costs, its sales and how often it is asked for, with why; Use, Keep, filters and the price changes made so far with sales before and since
- Receive delivery: a Selling price column - the price follows a higher cost (ticked by itself), new products get a suggestion instead of a flat +40%
- Product drawer: the suggested price for the cost typed
- Settings › General: the profit a sale should leave after running costs
- Every price change in the app is kept in the product's price history (the website's Use too)
- Stock › Prices › EasyPOS price list: the changed prices to type into EasyPOS, or every product's price, as a PDF (desktop) or print (web); "They're in EasyPOS" starts the next list

### Changed
- Website sync: a new shop price no longer asks "use the website price?" when the website price hasn't changed
- PDFs are offered in E:\Danfos Papers\Reports instead of Documents (OneDrive)

---

## [Released] - 2026-10-24 - Insights: the dashboard pages (desktop 1.4.1 rebuild, web, Android)

Full details are in GOLDEN_MANIFEST.md, Finding #74.

### Added
- Insights › Money, Stock, Customers, Instagram, Purchasing and Your apps: the "Danfosal overview" dashboard as live pages, read from the database when Insights opens (read-only, Refresh to read again)
- Insights › Overview: 12-month summary line, this month vs the same days last month, pace to the monthly target, owed to you, and the target on the monthly chart
- Settings › General: monthly revenue target (net of VAT), shared by every device
- Stock › Reorder: "Out of stock, still wanted" - best sellers that ran out and models people ask the chatbot for

### Fixed
- Insights' Average sale counted refunds as sales; refunds now leave the total and the count

### Changed
- One list of sales and refunds (`salesLedger()` in data.js) for Insights and the new pages; chart helpers shared in charts.js

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
