# Danfos Garanci (Warranty App)

Standalone Electron app for issuing Kärcher warranty certificates and
registering/tracking warranty claims. Built from a design handoff kept in
[`docs/design-handoff/`](docs/design-handoff/) (`GOLDEN_MANIFEST.md` + the
`Garanci Nate.dc.html` prototype). That folder is reference material only.
`build.files` does not include it, so it never ships in the installer.

## Relationship to the main Danfosal App

This is a **separate installed app** (own `package.json`, own installer), but
it is **not a separate backend** — it connects to the same Firebase project
(`danfosal-app`) as `resources/app/`, using the same anonymous-auth pattern.
Specifically:

- **Reads** `customers`, `onlineOrders`, `storeSales`. Reviewed corrections
  can update existing sale items/customer names and profile phone/NIPT/city;
  a missing customer profile can be created after confirmation. This app
  does not create new sales or orders.
- **Writes** `warrantyCards` (issuing a certificate) and `serviceTickets`
  (registering a claim) — both collections the main app already owns.
  `serviceTickets` is genuinely shared: claims filed here show up in the main
  app's [service-tickets.html](../resources/app/www/service-tickets.html)
  queue and vice versa. See the schema additions below.
- **Opens** the main app's existing `warranty-card.html` print page via
  `https://danfosal-app.web.app/warranty-card.html?...` (Firebase Hosting) —
  this app never renders its own certificate.
- New `counters/{warrantyCertNo,claimNo}` docs hold atomic yearly-reset
  sequence counters for `GAR-YYYY-NNNN` / `KRK-YYYY-NNNN` numbers.

## Schema additions to shared collections

`warrantyCards` gained (only from this app's Issue flow — older records stay
valid without them): `certNo`, `partsMonths` (24), `labourMonths` (12),
`warrantyUntil`, `invoiceNumber`.

`serviceTickets` gained (from this app's Claim flow): `claimNo`, `priority`
(`E ulët`/`Normal`/`Urgjent`), `mode` (`Në terren`/`Në servis`), `timeline`
(array of `{title, when, who}`), `tech` (free text — no staff login exists
anywhere in Danfosal App, by design). A 6th `status` value, `rejected`, was
added alongside the existing `received/in_progress/waiting_parts/completed/cancelled`.

## Current app (1.1.0)

Version 1.1.0 applies the approved charcoal/violet/cyan/gold design to the live
app, including the fixed workspace navigation, animated warranty card, depth
on summary/repair/machine cards, appearance controls, and reduced-motion support.
The shield over a warranty card is the custom Danfos Garanci logo. Its SVG source
is `www/assets/garanci-logo.svg`; `build/make-icon.cjs` generates the PNG and
multi-resolution Windows icon using Sharp.

The home page shows real service priorities, today's appointments, open requests,
waiting parts, expiring warranties, and the average delay from sale to issue.
The service board searches and filters all shared tickets. Machine passports
combine sales, per-item certificate matching, and service history. Scheduling
uses saved appointments, technician names, promised dates, and expected parts.

Service detail supports explicit review before saving status, technician,
appointment, promised date, notes, parts, intake condition/accessories and costs.
Customer messages are editable drafts copied by the user; the app sends nothing.
Completion adds a deduplicated repair entry to the matching warranty record in
the same transaction as the ticket update. A record created only for repair
history does not imply issued warranty coverage.

Additional compatible fields on `serviceTickets`:

- `scheduledAt` (Timestamp or null), `promisedBy` (local YYYY-MM-DD), `updatedAt`.
- `parts`: `{name, quantity, status: needed|ordered|received, expectedOn}` array.
- `repairCosts`: `{parts, labour, supplierClaim, supplierReceived, currency:'EUR'}`.
- `intake`: `{condition, accessories}`; `photoCount`; `lastCustomerContactAt`.
- `linkedItemIndex`, `warrantyCardId`, `warrantyCardItemIndex` make source-machine matching explicit, including manual items without serial numbers.
- `photos` subcollection: `{name, dataUrl, createdAt}`. Maximum 8 JPEG previews
  per ticket, compressed in the browser to 280,000 data-URL characters each.
  This uses the existing authenticated Firestore rules and needs no new Storage
  bucket configuration. Photos load on the service detail screen and on
  demand from a machine passport. There is no photo deletion interface.

Issued cards additionally retain `purchaseDate`, and each included item carries
`sourceItemIndex` (null for a manually added item). Existing 24/12-month policy
from the date of issue is preserved. Older records remain readable. If an older
certificate is ambiguous between identically named items, the app avoids claiming
coverage based on the invoice alone.

Source and profile corrections use transactions against fresh documents, preserve
unrelated fields, and reject conflicting edits. Service saves append to the latest
timeline and reject concurrent changes to the same editable fields.
Number allocation uses a separate transaction, so failed creation may leave a
numbering gap. Duplicate-submit guards apply within the current screen; there
is no persistent cross-session or cross-app duplicate constraint.

## Running it

```
npm install
npm start        # dev
npm run dist      # builds dist/Danfos Garanci Setup <version>.exe
```

Verification: `node tests/models.cjs` covers identity and update rules.
`tests/ui-smoke.cjs`, `tests/issue-claim-flow.cjs` and
`tests/manual-warranty-flow.cjs` use Playwright with an
in-memory Firebase SDK fixture and block external requests; they never write
production data. Screenshots and results are written to `artifacts/qa/`
(regenerated on every run and never committed).
The build includes only `www`, `main.js`, package metadata and production modules;
fixtures, QA artifacts, and source backups are excluded.

No build step for CSS/JS — `www/` is static files. The original handoff tokens
under `www/css/tokens/` are adapted by `modern.css`; typography now loads
the bundled font files. Current authoritative documentation is Finding #19
in [the repository Golden Manifest](../GOLDEN_MANIFEST.md), with installation
and validation evidence in [RELEASE_NOTES.md](RELEASE_NOTES.md).

## Known gaps (not blocking, noted for later)

- No auto-update — a manual reinstall is required for new versions, at least
  until this gets enough real usage to justify wiring one up.
- The claim screen prefers a saved `customers.city` and supports reviewed
  corrections. Older profiles without that field still rely on the best-effort
  address guess in `guessCity()`; imported address quality can affect results.
- Firebase Hosting must be redeployed (`firebase deploy --only hosting` from
  `resources/app/`) when the main app's hosted `warranty-card.html` changes,
  since certificate print links open the hosted page. Garanci-only UI changes
  require rebuilding/reinstalling this Electron app, without a Hosting deploy.
