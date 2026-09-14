# READ ME FIRST — Warranty module handoff

You are receiving a design handoff for a **warranty module (Garanci)** to be
built into an existing commerce/ERP app.

## What is in this zip

| File | What it is |
|---|---|
| `GOLDEN_MANIFEST.md` | **The spec.** App purpose, all screens, behaviours, data model, integration contract, rules. Read this first and treat it as authoritative. |
| `Garanci Nate.dc.html` | **The design.** Open it in a browser — it is a working, clickable prototype of every screen and state. This is the visual + interaction reference. |
| `_ds/` | The design system it uses: CSS tokens (colors, typography, spacing, effects) and a component bundle. Copy the token values from here; do not invent new ones. |
| `support.js` | Runtime for the prototype file only. **Not part of the product** — do not port it. |

## How to read the prototype

`Garanci Nate.dc.html` is a self-contained prototype, not production code.
Its structure is: an HTML template with `{{ value }}` holes at the top, and a
JavaScript class underneath that supplies those values and holds all state and
mock data (invoices, customers, claims).

Use it for: layout, spacing, copy (Albanian — keep it verbatim), colors,
component states, and the exact interaction flows.
Do **not** use it for: architecture, routing, or data access — rebuild those in
the host app's own stack and conventions.

## Suggested first steps

1. Read `GOLDEN_MANIFEST.md` end to end.
2. Open `Garanci Nate.dc.html` in a browser and click through all five screens:
   home → lësho garanci → kërkesë garancie → kërkesa në pritje → claim detail.
   Try the missing-data cases: invoice `FT-2026-0407` (no serial/phone) and
   customer *Market Ora* (no phone, no serial).
3. Inventory what the host app already provides: invoice records, customer
   records, the existing warranty print page, the customer portal update path.
   Map each row of the manifest's integration table to a real query/endpoint.
4. Report the mapping and any gaps **before** writing feature code — do not
   invent endpoints silently.
5. Build in this order: issue screen → claim screen → pending queue → claim
   detail.

## Hard rules (from the manifest, repeated because they are easy to miss)

- **Albanian UI copy**, imperative voice. English only for the eyebrow labels
  already in the design. No emoji.
- **Nothing is sent, published, or printed without an explicit confirm step**,
  and the UI says so.
- **Missing data is shown as missing and made editable in place** (`MUNGON`,
  "Telefoni mungon") — never blank, never auto-invented.
- **Manual corrections offer a write-back prompt** to update the customer
  profile in the portal; the user chooses persist vs. this-claim-only.
- **The warranty certificate/print page already exists in the host app.** This
  module fills its data and opens it. It never renders its own certificate and
  never emails the customer.
- Icons are single Unicode glyphs, not an icon library.
- Global `box-sizing: border-box`.
