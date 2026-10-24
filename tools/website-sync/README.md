# Website sync

Connects Danfosal App with the website (danfosal.com, managed in **AI Commerce Manager**), once a
day in the morning on the shop PC.

| What | Where it ends up |
|---|---|
| Shop products: code, name, stock, price, landed cost (net of VAT), units sold in 90 days, units on order | AI Commerce › **Produktet**: the website compared with the shop (stock, price, margin). Fixes there are plans you confirm. |
| Website prices that changed and differ from the shop's (a discount, say) | Danfosal App › **Stock › Website** and **Today**: *Use €…* or *Keep €…*. Nothing changes without that click. |
| New website orders | Danfosal App › **Sell › Online orders**, source *Web*. They don't take stock by themselves (use *Take from stock* on the order). An order you already typed in by hand is linked, not copied twice. |
| How the run went | **Stock › Website** (top panel) and Today, if it failed or didn't run. |

Every request is signed with a key that only AI Commerce and this PC know. No Danfosal key is
ever put on the web server. Logs go to `C:\Danfosal\Reports\website-sync\` (they name
customers, and this repo is public).

## Setting it up (once)

1. Upload AI Commerce **4.11.0** to the server (see its `UPGRADE-4.11.md`).
2. In AI Commerce: **Cilësimet › Krijo çelës sinkronizimi**, then copy the key.
3. Next to this file, create `website-sync.local.json` (git-ignored) from `website-sync.example.json`:

   ```json
   {
     "url": "https://danfosal.com/danfos-ai/danfos-ai-product-manager/sync.php",
     "secret": "the 64-character key from step 2"
   }
   ```

4. Try it without changing anything, from PowerShell in this folder:

   ```powershell
   node website-sync.mjs --dry-run
   ```

5. The first real run, then confirm the matches in AI Commerce › **Produktet** (*Kontrollo dhe
   konfirmo*). Until a website product is linked to a shop product, it is not compared.

   ```powershell
   node website-sync.mjs
   ```

6. Turn on the daily run (07:30, or at logon if the PC was off then; at most once a day):

   ```powershell
   powershell -ExecutionPolicy Bypass -File schedule-sync.ps1
   ```

   `-Off` turns it off again.

## Options

```text
node website-sync.mjs --dry-run     read everything, report, change nothing anywhere
node website-sync.mjs --push-only   only send the products to AI Commerce (no Firestore writes)
node website-sync.mjs               the daily run
node website-sync.mjs --daily       the same, skipped if today's run already succeeded (the task)
```

## Rules it follows

- **Prices:** a proposal is made when the website price differs from the shop's by more than
  €0.50. *Keep* is remembered: you are asked again only when the website price changes. When the
  two prices match again, an open proposal closes itself.
- **A new shop price** (Stock › Prices, a delivery, the catalogue) is not a question for the shop:
  when the website still has the price it had at the last run, the log says *shop price changed*
  and AI Commerce › Produktet shows the difference to fix on the website.
- **Orders:** website statuses map to the app's: pending/on hold → Pending, processing →
  Processing, completed → Paid, cancelled/failed → Cancelled, refunded → Returned. The last 45
  days are read each morning, so a status change on the website follows into the app.
- **One shop product, two website products:** if two website products are linked to the same
  shop product, no price question is made for them and the log says *CHECK LINKS*: fix the wrong
  link in AI Commerce › Produktet › the product › Lidhja.
- **One run at a time:** if the 07:30 and logon triggers fire together, the second run stops.
- **Products without a code** in Danfosal App are sent as `id:<document id>`, so they can still
  be linked; AI Commerce doesn't write those as SKUs on the website.
