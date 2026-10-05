# Paper Autopilot

Reads the PDFs that pile up in Downloads, works out what each one is from its own text, and
files it into **E:\Danfos Papers** under a name a person can read:

(Made-up examples; the real names are customers' and stay off this public repo.)

```
7573000001 (3).pdf   ->  Kärcher\Invoices\2026\2026-09-22 Kärcher invoice 7573000001 EUR 1,234.00.pdf
Document (60).pdf    ->  Bank\Payments\2026\2026-08-24 Payment to KARCHER EUR 1,234.00.pdf
Client.pdf           ->  Sales invoices\2026\2026-09-21 E-invoice 99-2026 CLIENT SHPK EUR 500.00.pdf
```

E: rather than Documents, because Windows syncs Documents to OneDrive (the owner's choice,
26 Sep 2026). E: is a partition of the same SSD as C:, so it is not a backup.

From PowerShell, in this folder (`npm run dry-run` etc. also work from Git Bash):

```powershell
npm install                                          # once
node autopilot.js                                    # plan + report, changes nothing
node autopilot.js --apply "<plan.json>"              # carry out a reviewed plan; run it again to finish a partial run
node autopilot.js --undo "<journal.jsonl>"           # put back everything that run moved
node autopilot.js --sweep                            # plan + apply in one go, for a schedule
```

Add `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON` after `node` to hide a harmless warning
about `karcher-invoice.js`.

Plans, reports, journals, `sweep.log` and `cache.json` go to `C:\Danfosal\Reports\paper-autopilot\`.
They stay on this PC: they name customers and amounts, and this repo is public.

## Safety

- **The dry run changes nothing.** Apply carries out exactly the plan it is given.
- **A file that changed since the plan was made is skipped** (its SHA-256 is checked first).
- **Nothing is overwritten.** If the destination name is taken, the file stays in Downloads.
- **Exact copies go to the Recycle Bin, never deleted**, and only while the copy that stays is
  still there. `recycle.ps1` does it the way Explorer's Delete key does, with no dialogs.
- **Every step is journalled as it happens**, so `undo` can put all moved files back even after an
  interrupted run. Recycled copies are restored from the Recycle Bin by hand.
- **A plan can be run again.** Files an earlier run moved (found in the journals beside it) count
  as done, and their copies are recycled against where they now are.
- **A PDF downloaded again after it was filed is recognised by content**, whatever its name: it is
  recycled, not filed a second time as "(2)".
- Moving C: to E: copies, checks the SHA-256, then removes the original, and keeps the file's date.
- **The sweep leaves anything downloaded in the last 15 minutes** (`--settle`), so a PDF you have
  just downloaded is still there to open or send. Only one sweep runs at a time.
- Tested 26 Sep 2026 on copies: a changed file and a taken name were both refused, 30 files went
  C: to E: with matching SHA-256 and dates, and undo returned every one.
- First real run, 26 Sep 2026: 457 PDFs filed to E:, all verified against the journal. The 77
  copies failed to recycle: Windows PowerShell's `ConvertFrom-Json` returned the list of paths as
  one object, which became one invalid path (error 124), unseen in a test with a single copy.
  `recycle.ps1` now reads plain lines, and a re-run of the plan finishes the job.

## What it recognises

Kärcher invoices, credit notes, proformas, order confirmations, warranty claims (Gewa) and
delivery notes; e-invoices from the Platforma Qendrore (sales and bills), easyPOS / easyInvoice
invoices, proformas; offers in all three of Danfos's layouts; Raiffeisen payment advices and
account statements; tax payment orders and returns; Albanian and Croatian customs declarations;
transport invoices; QKB extracts; supplier price lists and product sheets; catalogues; books and
research.

Personal records (contracts, birth and criminal-record certificates, passports) are recognised
by type and filed under their own names. Nothing is read out of them.

Since 5 Oct 2026 it also reads what isn't a plain PDF:

- **PDFs without ".pdf"** ("PDF (3)", "piramida") are recognised by their first bytes and filed
  with the extension added.
- **Word (.docx)** text goes through the same rules as a PDF's (offers, contracts, data sheets);
  **spreadsheets** by name ("dergesat", "raport_analitik", "Order_CustomerNo_", "redovni",
  "doganore"…) or, failing that, by their column labels (KODI TARIFOR → customs list, MaterialNo +
  GrossWeight → Kärcher packing list…); .doc, .pptx, .epub, .eml, .tif by name.
- **Bank statement exports** (Raiffeisen XML/CSV) are named by account and period, beside the PDFs.
- **Scans** are read with text recognition (`ocr.js`: pdf.js decodes the page picture, Tesseract
  from the app reads it) and placed by whose paper it is and what kind: Kärcher papers, Turkish
  export declarations, supplier e-invoices, leaflets. Dates come from the scanner's file name.
- New PDF rules: Turkish and Kosovo supplier invoices and proformas, contracts, tenders, reports,
  vehicle papers, warranty letters, shop signs, marketing, manuals and data sheets.
- **Key and recovery-code files** (Firebase admin keys, recovery codes) are never opened, hashed,
  moved or copied: they are left where they are and reported, because they belong in a password
  manager.

Photos, installers and music stay in Downloads, and so does anything it isn't sure of.

## How it decides

- `classify.js` holds one rule per document type, most specific first. A rule that can't find a
  field leaves it out of the name instead of guessing; a document with no date anywhere goes to
  an `Undated` folder.
- Kärcher invoices are read by `parseKarcher()` in `resources/app/www/app/karcher-invoice.js`,
  the same function Stock > Receive delivery uses.
- `pdftext.js` groups text into lines the way the app does, with the same pdf.js (3.11.174).
- `plan.js` finds exact copies by SHA-256 (the copy kept is the one without a browser's " (2)")
  and resolves name clashes: the older file keeps the name and the newer is numbered, except
  versions of one offer, which keep their old file name so FINAL and FINAL_v3 stay apart.
- `cache.json` remembers each file's SHA-256 and, for PDFs it didn't recognise, that answer, so a
  sweep doesn't re-read 3 GB of installers. The answers are dropped when `classify.js` or
  `karcher-invoice.js` changes.

## Every Monday, on its own

Scheduled task **Danfosal Paper Autopilot** (set up by `schedule-sweep.ps1`, removed by
`schedule-sweep.ps1 -Off`) starts `sweep-hidden.vbs` at 09:00 on Mondays (catching up if the PC
was off) and 3 minutes after every logon. `--sweep --weekly` does the work only on the first
start on or after a Monday, so the owner's rule holds: Downloads is filed every Monday, or the
next time the PC is turned on that week. Each run is one line in `sweep.log`; the time of the
last one is in `sweep-state.json`. The task runs as the logged-on user (it needs their Downloads
and Recycle Bin) and skips the week's run if E: is not there.

## Any day: "Check Downloads now"

The app has a **Check Downloads now** button (Stock › Purchases, and Receive delivery) for goods
that arrive mid-week. It does exactly the Monday work at once - `autopilot.js --now` - but with no
15-minute waiting period, since pressing it means "file what I just downloaded" (unfinished
`.crdownload`/`.part` downloads are still skipped). It prints a JSON summary the app shows: what
was filed where, copies recycled, purchase papers read, order-list lines added.

- **Desktop app:** `resources/app/autopilot-runner.js` (main process) runs the tool on the PC's
  Node and returns the summary; a second press while one runs joins it.
- **Phone or web:** the button writes a request to Firestore `autopilotRuns`; the desktop app on
  the shop PC, whenever it is open, claims every waiting request, runs one check for all of them
  and writes the result back, which the phone shows. If the PC doesn't take it within 90 seconds,
  the phone says so and the request waits until the app is opened there.
- One sweep at a time for all three (button, phone, Monday task): the `sweep.lock`.

`--no-sync` skips the purchase reading; it's for tests on a copy of Downloads, whose papers must
not reach the live data.

## Shortcuts in Downloads

`shortcuts.ps1` keeps a `_Archive - <folder>.lnk` in Downloads for every top-level archive
folder, plus `_Archive - All papers.lnk`. The `_` sorts them above everything else when
Downloads is sorted by name. Every apply and sweep refreshes them, so a new archive folder gets
one. They are shortcuts, never folder links: deleting one can't touch the archive. The filer
ignores `.lnk` files.

## Purchases: from order to shelf

`node autopilot.js --sync` (and every weekly sweep, after filing) reads the purchasing papers in
the archive and writes what each says to Firestore **`purchaseDocs`**, one document per paper,
keyed by the file's SHA-256 (`--resync` re-reads them all after a reader improves):

| Paper | Read by (`purchase-read.js`) | What it gives |
|---|---|---|
| Kärcher proforma / order confirmation | `readKarcherProforma`, `readKarcherOrderConfirmation` | order number, lines, total, cash-discount price |
| Kärcher invoice | `readKarcherInvoice` (on the app's `parseKarcher`) | order number(s), delivery note, lines with origin, EU preference and serials |
| Kärcher credit note | `readKarcherCreditNote` | the invoices it refunds (usually the 3% cash discount) |
| Kärcher warranty claim ("Gewa") | `readKarcherWarrantyClaim` | the claim as an order: the replacement machine or parts coming back, and the labour credited |
| Bank payment to a supplier or customs | `readPayment` | amount, and the order/invoice numbers written in its details, shorthand included ("7573087659, 660, 661") |
| Customs declaration | `readCustoms` | declared invoice total, rate, duty (DOG), VAT (TVS), everything else |
| Kärcher account statement (.xlsx) | `readKarcherStatement` | every invoice, payment and credit note, with what is still open |

The app links them in `resources/app/www/app/purchasing.js` and shows them in **Stock ›
Purchases**. A new order (under 60 days old, nothing invoiced) also goes onto the order list with
its order number, and so does a new warranty claim with goods coming back (at cost 0, marked as
a claim). Wages, rent and tax payments are not read, nor the customer named on a claim.

## Still to build

Customs declarations for 2026 are missing from the archive (two customs payments have no
declaration beside them), and 29 of the 115 invoices on Kärcher's statement have no PDF: both
limit what Purchases can cost. Other suppliers (Star, Rulopak) are filed but not yet linked.
