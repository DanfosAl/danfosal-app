# 🧠 Danfosal Smart Brain System

## Overview

The **Smart Brain** is an intelligent invoice processing system that automatically:
- **Deduplicates customers** across multiple invoice sources
- **Matches physical receipts** to online orders
- **Detects returns** and updates inventory automatically
- **Prevents duplicate processing** of invoices
- **Maintains audit trails** for all transactions

---

## 🎯 Key Features

### 1. Smart Customer Deduplication

**Prevents duplicate customer records** using multi-strategy matching:

```javascript
Strategy 1: NIPT (Tax ID) - Most reliable
Strategy 2: Exact name match
Strategy 3: Fuzzy name match (case-insensitive, trimmed)
```

**How it works:**
1. When an invoice arrives, the system searches for existing customers
2. Checks NIPT first (Albanian tax identification number)
3. Falls back to name matching if no NIPT available
4. Only creates a new customer if NO match is found
5. Walk-in customers are NEVER saved to the database

**Database Impact:**
- Links invoice to existing customer ID
- Maintains clean customer database without duplicates

---

### 2. Online Order Matching (Smart Mapping)

**Automatically links printed invoices to online orders:**

```
IF customer name matches an online order
AND items (names + quantities) match exactly
THEN link invoice to that order (don't create new sale)
```

**Process Flow:**
1. Invoice arrives with customer "John Doe"
2. System searches for pending/confirmed online orders for "John Doe"
3. Compares invoice items with each order's items
4. If items match: Updates order status to "Processing" and links invoice
5. If no match: Registers as a new walk-in sale

**Why this matters:**
- Prevents double-counting sales (online order + printed receipt)
- Unifies analytics across online and physical channels
- Automatically tracks order fulfillment

**Database Changes:**
```firestore
onlineOrders/{orderId}:
  status: "Processing" (was "pending")
  processedAt: "2026-02-08T15:45:00Z"
  linkedInvoiceNumber: "68/2026/mv200vz195"
  linkedCaptureJobId: "00007"
  linkedCaptureTimestamp: "20260208_152857"
```

---

### 3. Return & Cancellation Logic

**Detects returns using multiple signals:**

#### Detection Methods:
1. **Negative Total:** `total < 0` → Return
2. **Return Keywords:** RETURN, REFUND, STORNO, ANULIM, KTHIM → Return
3. **Cancellation Keywords:** CANCEL, CANCELLED, VOID, ANULLO → Cancellation
4. **Invoice Pattern:** Starts with "R-", "RET-", "RETURN-" → Return

#### What Happens on Return Detection:

```javascript
1. Transaction recorded in 'returns' collection
2. Items returned to 'stock' collection (quantity increased)
3. Invoice recorded in history with action='return' or 'cancellation'
4. No sale record created in 'storeSales'
```

#### Stock Update Example:

```
Item: "K 5 Basic *EU"
Current Stock: 15
Return Quantity: 2
New Stock: 17 ✅

Stock Record Updated:
  quantity: 17
  lastUpdated: [timestamp]
  lastUpdateReason: "return"
```

**Database Collections:**

**`returns` Collection:**
```firestore
{
  type: "return" or "cancellation",
  reason: "Negative total amount",
  invoiceNumber: "68/2026/mv200vz195",
  invoiceDate: "08/02/2026",
  customerName: "SushiCo Albania",
  total: 340.00,
  currency: "EUR",
  items: [...],
  timestamp: [Firestore.Timestamp],
  easypos: {
    captureJobId: "00007",
    captureTimestamp: "20260208_152857",
    source: "print-capture"
  }
}
```

**`stock` Collection Update:**
```firestore
{
  productId: "easypos-k-5-basic-eu",
  productName: "K 5 Basic *EU",
  quantity: 17,
  lastUpdated: [Firestore.Timestamp],
  lastUpdateReason: "return",
  source: "easypos-return"
}
```

---

### 4. Invoice History & Duplicate Prevention

**Maintains comprehensive audit trail:**

**`invoiceHistory` Collection:**
```firestore
{
  invoiceNumber: "68/2026/mv200vz195",
  invoiceDate: "08/02/2026",
  customerName: "SushiCo Albania",
  total: 340.00,
  currency: "EUR",
  action: "walk_in_sale" | "online_order_matched" | "return" | "cancellation",
  relatedId: "[saleId or orderId]",
  processedAt: "2026-02-08T15:33:47.422Z",
  captureJobId: "00007"
}
```

**Duplicate Prevention:**
- Before processing any invoice, system checks if invoice number already exists
- If found: Skips processing and logs warning
- Prevents double-processing if invoice is re-printed or captured multiple times

---

## 📊 Database Schema Updates

### New Collections:

#### 1. `invoiceHistory`
**Purpose:** Track all processed invoices to prevent duplicates and maintain audit trail

**Fields:**
- `invoiceNumber` (string): Unique invoice identifier
- `invoiceDate` (string): Date from invoice
- `customerName` (string): Customer on invoice
- `total` (number): Total amount
- `currency` (string): EUR, USD, etc.
- `action` (string): walk_in_sale, online_order_matched, return, cancellation
- `relatedId` (string): saleId or orderId this invoice links to
- `processedAt` (ISO timestamp): When invoice was processed
- `captureJobId` (string): Print capture job ID

**Indexes Needed:**
```javascript
// Create composite index in Firebase Console:
invoiceNumber ASC, processedAt DESC
```

#### 2. `returns`
**Purpose:** Track all return and cancellation transactions

**Fields:**
- `type` (string): "return" or "cancellation"
- `reason` (string): Why detected as return
- `invoiceNumber` (string): Original invoice number
- `invoiceDate` (string): Date from invoice
- `customerName` (string): Customer name
- `total` (number): Absolute value of return amount
- `currency` (string): Currency code
- `items` (array): Returned items with quantities
- `timestamp` (Firestore.Timestamp): When processed
- `easypos` (object): Capture metadata

**Indexes Needed:**
```javascript
// Create in Firebase Console:
type ASC, timestamp DESC
```

### Updated Collections:

#### 3. `customers` (Enhanced)
**New Field:**
- `nipt` (string): Albanian tax identification number for better deduplication

**Existing Fields:**
- `name`, `email`, `phone`, `address`, `status`, `image`, `source`, `createdAt`

**Indexes Needed:**
```javascript
// Create in Firebase Console:
nipt ASC
name ASC
```

#### 4. `stock` (Enhanced)
**New Fields:**
- `lastUpdated` (Firestore.Timestamp): When stock was last modified
- `lastUpdateReason` (string): "sale", "return", "adjustment", etc.
- `source` (string): Where stock record originated

**Existing Fields:**
- `productId`, `productName`, `quantity`

#### 5. `onlineOrders` (Enhanced)
**New Fields When Matched:**
- `processedAt` (ISO timestamp): When order was fulfilled
- `linkedInvoiceNumber` (string): Invoice number that fulfilled this order
- `linkedCaptureJobId` (string): Print capture job ID
- `linkedCaptureTimestamp` (string): Timestamp of capture

**Status Transitions:**
```
"pending" → "Processing" (when invoice matched)
"confirmed" → "Processing" (when invoice matched)
```

---

## 🔄 Processing Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     INVOICE ARRIVES                              │
│                    (Print Capture)                               │
└───────────────────┬─────────────────────────────────────────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │ Step 1: Check History│  ← invoiceHistory collection
         │ (Duplicate Detection)│
         └──────────┬───────────┘
                    │
            ┌───────┴────────┐
            │ Duplicate?     │
            └───┬────────┬───┘
                │        │
            YES │        │ NO
                │        │
                ▼        ▼
         ┌──────────┐   ┌──────────────────────┐
         │  SKIP    │   │ Step 2: Return Check │
         │ (logged) │   │ (Negative/Keywords)  │
         └──────────┘   └──────────┬───────────┘
                                   │
                           ┌───────┴────────┐
                           │ Is Return?     │
                           └───┬────────┬───┘
                               │        │
                           YES │        │ NO
                               │        │
                               ▼        ▼
                    ┌──────────────┐   ┌──────────────────────┐
                    │ Process      │   │ Step 3: Customer     │
                    │ Return:      │   │ Deduplication        │
                    │ - Record in  │   │ (NIPT/Name Match)    │
                    │   returns    │   └──────────┬───────────┘
                    │ - Update     │              │
                    │   stock ↑    │              ▼
                    │ - Log        │   ┌──────────────────────┐
                    └──────────────┘   │ Step 4: Online Order │
                                       │ Matching             │
                                       │ (Name + Items)       │
                                       └──────────┬───────────┘
                                                  │
                                          ┌───────┴────────┐
                                          │ Order Match?   │
                                          └───┬────────┬───┘
                                              │        │
                                          YES │        │ NO
                                              │        │
                                              ▼        ▼
                                   ┌──────────────┐   ┌─────────────┐
                                   │ Update Order │   │ Create New  │
                                   │ Status:      │   │ Walk-in Sale│
                                   │ "Processing" │   │ in          │
                                   │              │   │ storeSales  │
                                   │ Link Invoice │   └─────────────┘
                                   └──────────────┘
                                           │                │
                                           └────────┬───────┘
                                                    │
                                                    ▼
                                         ┌──────────────────┐
                                         │ Step 5: Record   │
                                         │ in invoiceHistory│
                                         └──────────────────┘
```

---

## 📝 Log Messages Explained

### Normal Walk-in Sale:
```
[INFO] 🧠 [SMART BRAIN] Analyzing invoice...
[INFO]    🔍 Searching for existing customer...
[INFO]    ✓ Found by NIPT: L98765432X → WMByvXcoQE4nqSWNSeO3
[INFO]    🔍 Searching for matching online orders...
[INFO]    → No pending online orders for SushiCo Albania
[INFO]    📝 Registering as new walk-in sale...
[INFO]    ✓ Sale created: 2WqT7Ugmml8fHN2A0C22
[INFO]    ✓ Total: EUR 340
[INFO]    ✓ Items: 1 products
[INFO]    ✓ Invoice history updated
[SUCCESS] ✅ Database save complete!
```

### Online Order Matched:
```
[INFO] 🧠 [SMART BRAIN] Analyzing invoice...
[INFO]    ✓ Customer: John Doe (ID: abc123)
[INFO]    🔍 Searching for matching online orders...
[INFO]    → Found 2 pending order(s), checking items...
[INFO]    ✓ MATCH FOUND: Order xyz789
[INFO]    🎯 ONLINE ORDER MATCHED: xyz789
[INFO]    → Updating order status to 'Processing'
[SUCCESS] Order linked successfully!
```

### Return Detected:
```
[INFO] 🧠 [SMART BRAIN] Analyzing invoice...
[INFO]    🔄 RETURN DETECTED: Negative total amount
[INFO]    🔄 Processing return...
[INFO]    ✓ Return recorded: ret456
[INFO]       → K 5 Basic *EU: 15 + 2 = 17
[INFO]    ✓ Stock updated (items returned to inventory)
[SUCCESS] ✅ RETURN processed successfully!
```

### Duplicate Detected:
```
[INFO] 🧠 [SMART BRAIN] Analyzing invoice...
[WARN]    ⚠️ DUPLICATE: Invoice 68/2026/mv200vz195 already processed
[INFO]    → Skipping duplicate invoice
```

---

## 🚀 Testing the Smart Brain

### Test Scenario 1: Normal Sale (Walk-in)
1. Print an invoice from EasyPOS with a new customer
2. Check logs: Should see "Registering as new walk-in sale"
3. Verify in Firebase: New sale in `storeSales`, new entry in `invoiceHistory`

### Test Scenario 2: Customer Deduplication
1. Print invoice with customer "SushiCo Albania" (already exists)
2. Check logs: Should see "Found by name: SushiCo Albania → [existingId]"
3. Verify: Sale links to existing customer ID, no duplicate customer created

### Test Scenario 3: Online Order Matching
1. Create online order in app for "John Doe" with specific items
2. Print invoice from EasyPOS with same customer and items
3. Check logs: Should see "ONLINE ORDER MATCHED: [orderId]"
4. Verify in Firebase: Order status updated to "Processing", no new sale created

### Test Scenario 4: Return Processing
1. Create invoice with negative total or "RETURN" keyword
2. Check logs: Should see "RETURN DETECTED" and stock updates
3. Verify in Firebase: 
   - New record in `returns` collection
   - Stock quantities increased
   - Entry in `invoiceHistory` with action="return"

### Test Scenario 5: Duplicate Prevention
1. Print the same invoice twice (same invoice number)
2. Second attempt should log: "DUPLICATE: Invoice [number] already processed"
3. Verify: Only one entry in `invoiceHistory` and `storeSales`

---

## ⚙️ Configuration

### Supported Languages
Currently supports Albanian keywords for returns:
- ANULIM (cancel)
- KTHIM (return)
- STORNO (void)

To add more languages, edit `detectReturnOrCancellation()` in [easypos-ocr-bridge.js](easypos-ocr-bridge.js):

```javascript
const returnKeywords = ['RETURN', 'REFUND', 'STORNO', 'ANULIM', 'KTHIM', 'YourKeyword'];
```

### Matching Sensitivity
Item matching is **exact** (case-insensitive). To adjust:

Edit `matchOrderItems()` in [easypos-ocr-bridge.js](easypos-ocr-bridge.js) lines ~580-610.

---

## 🔧 Firebase Console Setup

### Required Indexes:

1. **invoiceHistory**:
   ```
   Collection: invoiceHistory
   Field: invoiceNumber (ASC)
   Field: processedAt (DESC)
   ```

2. **returns**:
   ```
   Collection: returns
   Field: type (ASC)
   Field: timestamp (DESC)
   ```

3. **customers**:
   ```
   Collection: customers
   Field: nipt (ASC)
   ---
   Field: name (ASC)
   ```

4. **onlineOrders**:
   ```
   Collection: onlineOrders
   Field: customerName (ASC)
   Field: status (ASC)
   ```

### Security Rules Update:

Add to `firestore.rules`:

```javascript
match /invoiceHistory/{docId} {
  allow read, write: if request.auth != null;
}

match /returns/{docId} {
  allow read, write: if request.auth != null;
}

match /stock/{docId} {
  allow read: if request.auth != null;
  allow write: if request.auth != null; // Smart Brain updates
}
```

---

## 📈 Benefits

### For Business:
- ✅ **Unified Analytics**: Online and physical sales in one system
- ✅ **Accurate Inventory**: Returns automatically update stock
- ✅ **Clean Database**: No duplicate customers or invoices
- ✅ **Audit Trail**: Complete history of all transactions
- ✅ **Automated Fulfillment**: Online orders marked as processing when printed

### For Operations:
- ✅ **Zero Manual Data Entry**: Everything automated from print capture
- ✅ **Error Prevention**: Duplicate detection prevents double-counting
- ✅ **Smart Reconciliation**: Receipts automatically matched to orders
- ✅ **Inventory Integrity**: Returns restore stock levels automatically

---

## 🛠️ Troubleshooting

### Issue: Customer duplicates still being created

**Check:**
1. Ensure NIPT is being extracted correctly from invoices
2. Verify `nipt` field exists in existing customer records
3. Check Firebase index on `customers.nipt` is active

**Fix:**
Add NIPT to existing customers manually or run migration script.

---

### Issue: Online orders not matching

**Check:**
1. Customer name must match **exactly** (case-insensitive)
2. Item names and quantities must match **exactly**
3. Order status must be "pending" or "confirmed" (lowercase or capitalized)

**Debug:**
Check logs for: "No pending online orders for [name]" or "No matching items found"

---

### Issue: Returns not detected

**Check:**
1. Total value is negative OR
2. Keywords present in OCR text OR
3. Invoice number starts with R-, RET-, RETURN-

**Debug:**
Check logs for: "RETURN DETECTED: [reason]"

If not detected, OCR text might be incorrect. Check `_debug.rawText` in processed JSON files.

---

### Issue: Stock not updating on returns

**Check:**
1. `stock` collection exists in Firebase
2. productId format matches: `easypos-[item-name-slugified]`
3. Firebase permissions allow write to `stock`

**Debug:**
Check logs for: "Failed to update stock for [item]"

---

## 📚 Related Files

- **Implementation**: [easypos-ocr-bridge.js](easypos-ocr-bridge.js)
- **Firebase Config**: [firebase-admin-config.js](firebase-admin-config.js)
- **Service Key**: [serviceAccountKey.json](serviceAccountKey.json)
- **Startup Script**: [E:\DanfosalApp\DanfosalStartup.bat](../../DanfosalStartup.bat)

---

## 🎓 Next Steps

1. **Test each scenario** using the testing guide above
2. **Create Firebase indexes** in Firebase Console
3. **Update security rules** in Firebase Console
4. **Monitor logs** during first production invoices: `C:\Danfosal\Logs\easypos-ocr-bridge.log`
5. **Verify database records** in Firebase Console after each test

---

## 🆘 Support

For issues or questions:
1. Check logs: `C:\Danfosal\Logs\easypos-ocr-bridge.log`
2. Check processed JSON files: `C:\Danfosal\Inbox\EasyPOS\Processed\*_data.json`
3. Review Firebase collections: `invoiceHistory`, `returns`, `storeSales`
4. Verify services running: Print Capture Service + OCR Bridge

---

**Smart Brain Version:** 1.0  
**Last Updated:** February 8, 2026  
**Author:** Danfosal Development Team
