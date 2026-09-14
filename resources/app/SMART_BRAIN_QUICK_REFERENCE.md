# 🧠 Smart Brain Quick Reference

## What It Does

**Smart Brain** transforms printed EasyPOS receipts into intelligent data that:
- ✅ Deduplicates customers automatically
- ✅ Matches receipts to online orders
- ✅ Detects returns and updates inventory
- ✅ Prevents duplicate invoice processing

---

## Decision Tree

```
INVOICE ARRIVES
    │
    ├─→ Already processed? → SKIP (log duplicate)
    │
    ├─→ Is return/cancellation?
    │   └─→ YES → Record in 'returns', Update stock ↑, Log history
    │
    ├─→ Customer exists?
    │   ├─→ YES (by NIPT/Name) → Link to existing customer
    │   └─→ NO → Create new customer (if not Walk-in)
    │
    ├─→ Matches online order? (Name + Items)
    │   ├─→ YES → Update order status → "Processing"
    │   └─→ NO → Create new walk-in sale → 'storeSales'
    │
    └─→ Record in 'invoiceHistory'
```

---

## Collections

| Collection | Purpose | Key Fields |
|------------|---------|------------|
| `invoiceHistory` | Audit trail, duplicate prevention | `invoiceNumber`, `action`, `processedAt` |
| `returns` | Return/cancellation tracking | `type`, `items`, `timestamp` |
| `stock` | Inventory levels | `productId`, `quantity`, `lastUpdateReason` |
| `customers` | Customer records (enhanced) | `name`, `nipt`, `source` |
| `onlineOrders` | Online orders (enhanced) | `status`, `linkedInvoiceNumber` |
| `storeSales` | Walk-in sales | `items`, `total`, `type: "easypos"` |

---

## Actions

| Action | Meaning |
|--------|---------|
| `walk_in_sale` | New sale recorded in storeSales |
| `online_order_matched` | Receipt matched to existing order |
| `return` | Return processed, stock updated |
| `cancellation` | Cancelled transaction |
| `duplicate_skipped` | Invoice already processed |

---

## Testing Scenarios

### Scenario 1: New Walk-in Customer
**Invoice:** New customer "ABC Company", 2 items  
**Expected:** New customer created, sale recorded, history logged  
**Check:** `customers` has new record, `storeSales` has sale, `invoiceHistory` has entry

### Scenario 2: Existing Customer
**Invoice:** Customer "SushiCo Albania" (already exists)  
**Expected:** Linked to existing customer, no duplicate created  
**Check:** `storeSales.customerId` matches existing customer ID

### Scenario 3: Online Order Match
**Setup:** Create online order for "John Doe" with 1x "Widget A"  
**Invoice:** Print receipt for "John Doe" with 1x "Widget A"  
**Expected:** Order status → "Processing", no new sale created  
**Check:** `onlineOrders` has `linkedInvoiceNumber`, `invoiceHistory.action = "online_order_matched"`

### Scenario 4: Return Detection
**Invoice:** Total = -50 EUR OR text contains "RETURN"  
**Expected:** Recorded in returns, stock increased  
**Check:** `returns` has entry, `stock.quantity` increased by returned amount

### Scenario 5: Duplicate Prevention
**Invoice:** Same invoice number printed twice  
**Expected:** Second attempt skipped with warning  
**Check:** Only ONE entry in `invoiceHistory` and `storeSales`

---

## Log Messages

| Message | Meaning |
|---------|---------|
| `🧠 [SMART BRAIN] Analyzing invoice...` | Processing started |
| `⚠️ DUPLICATE: Invoice [number] already processed` | Duplicate detected |
| `🔄 RETURN DETECTED: [reason]` | Return identified |
| `✓ Found by NIPT: [nipt] → [id]` | Customer matched by tax ID |
| `✓ Found by name: [name] → [id]` | Customer matched by name |
| `🎯 ONLINE ORDER MATCHED: [orderId]` | Receipt linked to order |
| `📝 Registering as new walk-in sale...` | Creating new sale |
| `✓ Sale created: [saleId]` | Sale recorded successfully |
| `✓ Invoice history updated` | Audit trail complete |
| `✅ Database save complete!` | Processing finished |

---

## Files

| File | Purpose |
|------|---------|
| `easypos-ocr-bridge.js` | Main Smart Brain logic |
| `SMART_BRAIN_GUIDE.md` | Complete documentation |
| `FIREBASE_SMART_BRAIN_SETUP.md` | Setup instructions |
| `firestore.indexes.json` | Firebase index configuration |
| `test-smart-brain.js` | Permissions verification |
| `migrate-customers.js` | Add NIPT field to existing customers |

---

## Commands

```powershell
# Test Smart Brain setup
cd E:\DanfosalApp\resources\app
node test-smart-brain.js

# Migrate existing customers
node migrate-customers.js

# Deploy Firebase indexes
firebase deploy --only firestore:indexes --project danfosal-app

# View recent Smart Brain logs
Get-Content C:\Danfosal\Logs\easypos-ocr-bridge.log | Select-String "SMART BRAIN"

# Check for duplicates
Get-Content C:\Danfosal\Logs\easypos-ocr-bridge.log | Select-String "DUPLICATE"

# Check returns
Get-Content C:\Danfosal\Logs\easypos-ocr-bridge.log | Select-String "RETURN DETECTED"

# Check order matches
Get-Content C:\Danfosal\Logs\easypos-ocr-bridge.log | Select-String "ONLINE ORDER MATCHED"
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Missing or insufficient permissions" | Update Firestore security rules |
| "Index not found" | Create indexes via Firebase Console or CLI |
| Customer duplicates still created | Run `migrate-customers.js` to add NIPT field |
| Orders not matching | Check customer name exact match, verify items |
| Returns not detected | Check OCR text for keywords, verify total sign |
| Stock not updating | Check Firebase permissions on `stock` collection |

---

## Firebase Console Links

- Project: https://console.firebase.google.com/project/danfosal-app
- Indexes: https://console.firebase.google.com/project/danfosal-app/firestore/indexes
- Rules: https://console.firebase.google.com/project/danfosal-app/firestore/rules
- invoiceHistory: https://console.firebase.google.com/project/danfosal-app/firestore/data/invoiceHistory
- returns: https://console.firebase.google.com/project/danfosal-app/firestore/data/returns
- stock: https://console.firebase.google.com/project/danfosal-app/firestore/data/stock

---

**Version:** 1.0 | **Updated:** Feb 8, 2026 | **Status:** Production Ready ✅
