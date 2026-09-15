# GOLDEN MANIFEST — Warranty App (Garanci)

> **Historical design handoff — superseded for production (September 13, 2026).** The installed app is Danfos Garanci **1.1.0**, implemented in `E:\DanfosalApp\WarrantyApp\` as an Electron app using the shared `danfosal-app` Firebase project. The PHP/WooCommerce assumptions and original appearance below describe the initial concept, not the current implementation. For the authoritative current behavior, schema, approved dark/3D design, logo, installation and verification, read **Finding #19** in [the repository Golden Manifest](../../GOLDEN_MANIFEST.md), plus [the implementation guide](../../WarrantyApp/README.md) and [1.1.0 release notes](../../WarrantyApp/RELEASE_NOTES.md). The original handoff is retained below for historical reference.

Original specification for what this app is, how it behaves, and how it plugs
into the main commerce app. Hand this file to Claude Code together with
`Garanci Nate.dc.html`.

---

## 1. What this is

A warranty module for an existing self-hosted commerce/ERP app (PHP + WooCommerce
data, the "main app"). Two jobs:

1. **Lëshim garancie (issue)** — turn an invoice into a warranty certificate.
2. **Kërkesë garancie (claim)** — register and track a warranty claim for a
   machine a customer already bought.

It is an **internal staff tool**, not a customer-facing site. Products are
cleaning machines (Kärcher and similar B2B equipment).

- **UI language: Albanian.** All labels, buttons, empty states, toasts.
  Technical eyebrow labels above headings stay English (`ISSUE · AUTO-FILL`,
  `PENDING CLAIMS QUEUE`) — that two-language pairing is intentional.
- **Voice:** direct, imperative, second person ("Lësho garanci", "Zgjidhni
  makinerinë me defekt").
- **Safety-first rule (non-negotiable):** nothing is written to the store,
  sent to a customer, or printed without explicit staff confirmation. Every
  data-changing flow shows a preview + confirm step and says so in copy.

## 2. Design source of truth

- Design file: **`Garanci Nate.dc.html`** (the only design; the earlier light
  version was discarded). It is the visual + behavioural spec — match it.
- Design system: **AI Commerce Manager Design System**, bound at
  `_ds/ai-commerce-manager-design-system-c01bcd1c-9ae9-45b9-bbf1-1bbe01bef514/`
  (tokens in `tokens/*.css`, components in `_ds_bundle.js`).
- Visual direction: dark futuristic glass — near-black `#0a0818`, aurora
  violet/cyan/pink radial glows, frosted panels
  (`backdrop-filter: blur(22px) saturate(1.5)`, 1px `rgba(255,255,255,.12)`
  border, `inset 0 1px 0 rgba(255,255,255,.22)` specular top edge), spring
  easing `cubic-bezier(.34,1.56,.64,1)` on hover lift.
- Type: **Space Grotesk** (display/headings/stat numbers), **Plus Jakarta Sans**
  (body/UI). Icons are **single Unicode glyphs** (✦ ◎ ⇄ ✎ ⌗ ◷ ✓ ↗ ↶) — never an
  icon library, never decorative emoji.
- Always `box-sizing: border-box` globally (padded inputs otherwise overflow
  their grid track).

## 3. Screens

| Screen | Route intent | Purpose |
|---|---|---|
| `home` | `/garanci` | Two large glass tickets: Lësho garanci / Kërkesë garancie, plus 4 KPI tiles |
| `issue` | `/garanci/lesho` | Invoice → auto-filled warranty form → generate + print |
| `claim` | `/garanci/kerkese` | Customer lookup → pick machine → defect details → register |
| `pending` (list) | `/garanci/kerkesa` | Queue of open claims, filterable |
| `pending` (detail) | `/garanci/kerkesa/{no}` | Full claim: defect, facts, timeline, customer, actions |

The "Kërkesa në pritje" KPI tile on the home screen links to the pending queue.

### 3.1 Issue screen

- Left rail: **5 faturat e fundit**, live from the invoicing system, newest
  first. Selecting one refills the whole form.
- Right: 8 fields — Klienti, NIPT, Telefon, Makineria, Kodi i modelit, Numri
  serial, Nr. i faturës, Data e blerjes.
- Each field carries a state tag:
  - `AUTO` — filled from the invoice, read-only.
  - `MUNGON` — the invoice had no value; the field is immediately editable and
    outlined in yellow.
  - `REDAKTIM` — "Redakto manualisht" is on; every field is editable.
- Header counters: "N fusha të plotësuara automatikisht" / "N për t'u plotësuar".
- Primary action **"Gjenero dhe hap për printim"** → confirmation panel:
  certificate number, "të dhënat iu dërguan faqes së garancisë në aplikacionin
  kryesor", "profili i klientit u përditësua", plus **Hap faqen e printimit**
  and **Shiko profilin e klientit**.
- **The warranty certificate/print page is NOT built here.** It already exists
  in the main app. This module only assembles the payload and opens that page.
  No email is ever sent.

### 3.2 Claim screen

- Customer search (name / phone / NIPT / city) → result rows with initials
  avatar and machine count; empty state when nothing matches.
- Selected customer panel: name, phone/city/NIPT line, **Redakto klientin**
  toggle exposing an editable phone field (city/NIPT read-only), plus a
  "Telefoni mungon" flag when the phone is empty.
- Machine list for that customer — each row: name, S/N, purchase date, invoice,
  and a warranty badge (`Garanci aktive · deri DD.MM.YYYY` green / `Garancia ka
  skaduar` red). Selecting a row picks the machine being claimed.
- If a machine has no serial: inline **+ Shto numrin serial** field on the row.
- **Manual-edit write-back prompt:** any manually added phone or serial raises a
  panel listing the new values with two choices —
  **Përditëso profilin e klientit** (write back to the customer portal) or
  **Vetëm për këtë kërkesë** (use locally, don't persist). Confirmation line
  after sync.
- Defect details: free-text description, Prioriteti (E ulët / Normal / Urgjent),
  Mënyra e trajtimit (Në terren / Në servis).
- **Regjistro kërkesën** → claim number, customer notified.

### 3.3 Pending queue + detail

- Filters: Të gjitha / Urgjent / Pa caktuar / Pjesë e porositur.
- Row: priority stripe, claim no, priority + status pills, customer, machine,
  S/N, opened date, age, "Detajet ↗".
- Detail: glass hero (claim no, priority, status, machine, customer, S/N, opened
  date, age); defect description; 4 fact tiles (STATUSI, PRIORITETI, TRAJTIMI,
  GARANCIA); **Ecuria e kërkesës** timeline (completed steps green ✓, current
  step yellow ◷); customer sidebar (phone, city, invoice, warranty, technician);
  actions **Aprovo dhe cakto servisin**, **Kërko foto nga klienti**,
  **Refuzo kërkesën**, each behind the confirm rule.

## 4. Data model

```
Invoice   { no, date, customer, machine, total,
            data: { klienti, nipt, telefon, makineria, modeli, serial, fatura, data } }
Customer  { name, phone, city, nipt, machines[] }
Machine   { name, serial, bought, invoice, warrantyUntil, active }
Warranty  { certNo, invoiceNo, customer, machine, serial, issuedAt,
            partsMonths: 24, labourMonths: 12 }
Claim     { no, customerId, machine, serial, opened, priority, status, mode,
            invoice, warranty, tech, issue, timeline[{title, when, who}] }
```

Claim `status` values: `Pa caktuar`, `Në shqyrtim`, `Pjesë e porositur`.
Claim `priority`: `E ulët`, `Normal`, `Urgjent`.
Default warranty period: **24 muaj pjesët / 12 muaj puna** (configurable).

Everything in the design file is mock data — replace with live queries.

## 5. Integration contract with the main app

All data is read from the main app's database; this module owns no customer or
invoice records of its own.

| Need | Direction | Notes |
|---|---|---|
| Last 5 invoices | read | newest first, polled or pushed when an invoice is issued |
| Invoice detail → warranty prefill | read | maps to the 8 form fields; missing values arrive empty, never as placeholders |
| Customer search | read | match on name, phone, NIPT, city |
| Customer's machines + warranty status | read | derived from past invoices + issued warranties |
| Issue warranty | write | create the Warranty record, then open the main app's existing warranty print page with the certificate id |
| Manual field edits (phone, serial) | write, confirmed | only on explicit "Përditëso profilin e klientit"; must update the customer portal record |
| Claims | write | create/update claim + timeline entries |

Suggested endpoints (rename to match the main app's conventions):

```
GET  /api/invoices/recent?limit=5
GET  /api/invoices/{no}
GET  /api/customers?q=
GET  /api/customers/{id}/machines
POST /api/warranties                 -> { certNo, printUrl }
PATCH /api/customers/{id}            -> { phone?, machines:[{serial}] }
GET  /api/claims?status=&priority=
POST /api/claims
PATCH /api/claims/{no}               -> status, tech, timeline entry
```

After `POST /api/warranties`, navigate/open `printUrl` (the main app's existing
warranty page) — do not render a certificate in this module.

## 6. Rules for anyone extending this

1. Never send anything to a customer automatically; always a confirm step.
2. A missing value is shown as missing (`MUNGON`, "Telefoni mungon") and made
   editable in place — never silently blank, never fake-filled.
3. Any manual edit that could correct the master record must offer the
   portal write-back prompt.
4. Keep copy Albanian, imperative, and short. No emoji.
5. Extend the Unicode-glyph icon vocabulary rather than adding an icon set.
6. New surfaces reuse the glass panel recipe and the design-system tokens; no
   new colors outside `tokens/colors.css` and the dark glass overlays already
   defined in the design file.
