# 🔄 Smart Brain Update: Name-Based Identification

## Changes Made (February 8, 2026)

The Smart Brain customer identification logic has been updated to prioritize **Customer Name** as the primary matching key.

---

## 📋 What Changed

### **Before:**
- **Primary Key:** NIPT (Albanian Tax ID)
- **Fallback:** Customer Name
- **Invoice Tracking:** Separate `invoiceHistory` collection

### **After:**
- **Primary Key:** Customer Name (exact match)
- **Optional Metadata:** NIPT (saved if present, not used for matching)
- **Invoice Tracking:** `invoiceHistory` array inside each customer document

---

## 🎯 New Customer Matching Logic

```javascript
STEP 1: Search by exact customer name
   ├─→ Found? → Link to existing customer
   └─→ Not found? → Search by fuzzy name match (case-insensitive)
       ├─→ Found? → Link to existing customer
       └─→ Not found? → Create new customer (if not Walk-in)
```

### Key Points:
✅ **Name is PRIMARY** - Exact match takes precedence  
✅ **NIPT is OPTIONAL** - Saved as metadata, not used for deduplication  
✅ **Fuzzy matching** - Case-insensitive fallback  
✅ **Walk-in handling** - Walk-in customers NOT saved to database  

---

## 📝 Invoice History Per Customer

Every customer document now includes an **`invoiceHistory` array**:

```javascript
{
  name: "SushiCo Albania",
  email: "contact@sushico.al",
  phone: "+355 69 123 4567",
  address: "Rruga Muhamet Gjollesha, Tirane",
  nipt: "L98765432X", // Optional metadata
  status: "Active",
  source: "easypos-import",
  createdAt: "2026-02-08T12:00:00Z",
  invoiceHistory: [
    "68/2026/mv200vz195",
    "69/2026/mv200vz196",
    "70/2026/mv200vz197"
  ], // Array of invoice numbers
  lastInvoiceDate: "2026-02-08T15:33:47Z"
}
```

### Features:
- **Automatic Append:** Each new invoice number added to customer's array
- **Duplicate Prevention:** Same invoice never added twice
- **Quick Lookup:** Check if customer has specific invoice via `array-contains`
- **Purchase History:** See complete history for analytics

---

## 🔍 Duplicate Detection

**Before:**
```javascript
// Separate invoiceHistory collection
SELECT * FROM invoiceHistory WHERE invoiceNumber = "68/2026/mv200vz195"
```

**After:**
```javascript
// Query customers with invoice in their history array
SELECT * FROM customers WHERE invoiceHistory CONTAINS "68/2026/mv200vz195"
```

---

## 🗄️ Database Schema Updates

### **customers Collection:**

**New Fields:**
- `invoiceHistory: []` - Array of invoice numbers (required)
- `lastInvoiceDate` - ISO timestamp of most recent invoice (auto-updated)

**Modified Fields:**
- `nipt` - Now optional metadata (was primary key)

### **Removed:**
- `invoiceHistory` collection (no longer needed)

### **Indexes Updated:**

**Removed:**
```javascript
// invoiceHistory collection indexes (deprecated)
```

**Added:**
```javascript
// customers.invoiceHistory array index
{
  collectionGroup: "customers",
  fields: [
    { fieldPath: "invoiceHistory", arrayConfig: "CONTAINS" }
  ]
}
```

---

## 📦 Files Modified

| File | Changes |
|------|---------|
| `easypos-ocr-bridge.js` | Updated `findOrCreateCustomer()` - Name is now primary key<br>Added `addInvoiceToCustomerHistory()` method<br>Updated `checkInvoiceHistory()` - Query customers array<br>Removed `recordInvoiceHistory()` method |
| `migrate-customers.js` | Now adds both `nipt` and `invoiceHistory: []` fields |
| `firestore.indexes.json` | Removed invoiceHistory collection index<br>Added customers.invoiceHistory array index |

---

## 🚀 Migration Required

### **Step 1: Update Existing Customers**

Run migration to add `invoiceHistory` array to all customers:

```powershell
cd E:\DanfosalApp\resources\app
npm run migrate-customers
```

Expected output:
```
→ Updating SushiCo Albania (WMByvXcoQE4nqSWNSeO3) - Adding invoiceHistory array
✅ Migration successful! All customers now have NIPT and invoiceHistory fields.
```

### **Step 2: Deploy New Firebase Indexes**

```powershell
firebase deploy --only firestore:indexes --project danfosal-app
```

Or manually in Firebase Console:
1. Go to [Firestore Indexes](https://console.firebase.google.com/project/danfosal-app/firestore/indexes)
2. Delete old `invoiceHistory` collection indexes
3. Create new index:
   - Collection: `customers`
   - Field: `invoiceHistory` - Array Contains

### **Step 3: Test with Real Invoice**

```powershell
# Restart OCR Bridge
Stop-Process -Name node -Force
cd E:\DanfosalApp\resources\app
npm run bridge

# Print test invoice and check logs
Get-Content C:\Danfosal\Logs\easypos-ocr-bridge.log -Tail 30
```

Expected log output:
```
[INFO] 🧠 [SMART BRAIN] Analyzing invoice...
[INFO]    🔍 Searching for existing customer by name...
[INFO]    ✓ Found by name: SushiCo Albania → WMByvXcoQE4nqSWNSeO3
[INFO]    ✓ Customer: SushiCo Albania (ID: WMByvXcoQE4nqSWNSeO3)
[INFO]    → Added invoice 71/2026/mv200vz198 to customer history (total: 4)
[INFO]    ✓ Invoice added to customer history
[SUCCESS] ✅ Database save complete!
```

---

## 🎯 Benefits

### **1. Simpler Identification**
- No need for tax IDs (NIPT)
- Works with any customer name
- More flexible for international customers

### **2. Better Purchase History**
- Complete history per customer
- Quick lookup: "Has this customer purchased before?"
- Analytics: Customer lifetime value, purchase frequency

### **3. Cleaner Database**
- One less collection (invoiceHistory removed)
- All customer data in one place
- Easier to query and maintain

### **4. Duplicate Prevention**
- Still prevents duplicate invoices
- Checks all customers' history arrays
- No separate collection needed

---

## 📊 Example Workflow

### **New Customer:**
```
1. Invoice arrives: "ABC Company", Invoice #72/2026/mv200vz199
2. Search customers by name "ABC Company" → Not found
3. Create new customer:
   {
     name: "ABC Company",
     nipt: "L12345678X" (if present),
     invoiceHistory: []
   }
4. Add invoice to history:
   invoiceHistory: ["72/2026/mv200vz199"]
5. Save sale to storeSales
```

### **Existing Customer:**
```
1. Invoice arrives: "ABC Company", Invoice #73/2026/mv200vz200
2. Search customers by name "ABC Company" → Found (ID: xyz123)
3. Check invoiceHistory array → Invoice not in array
4. Append to array:
   invoiceHistory: ["72/2026/mv200vz199", "73/2026/mv200vz200"]
5. Update lastInvoiceDate
6. Save sale to storeSales with customerId: xyz123
```

### **Duplicate Invoice:**
```
1. Invoice arrives: "ABC Company", Invoice #72/2026/mv200vz199 (already processed)
2. Check customers where invoiceHistory contains "72/2026/mv200vz199" → Found
3. Log warning: "DUPLICATE: Invoice already processed"
4. Skip processing
```

---

## 🔧 Troubleshooting

### Issue: Customer duplicates still created
**Cause:** Name variations (e.g., "ABC Co" vs "ABC Company")  
**Solution:** Names must match exactly. Update customer name in database if needed.

### Issue: Invoice not added to history
**Cause:** Customer document doesn't have `invoiceHistory` array  
**Solution:** Run `npm run migrate-customers` to add field to existing customers

### Issue: "Index not found" error
**Cause:** New array index not deployed  
**Solution:** Deploy indexes: `firebase deploy --only firestore:indexes`

---

## 📚 Updated Documentation

All Smart Brain documentation has been updated:
- ✅ SMART_BRAIN_GUIDE.md - Updated matching logic section
- ✅ FIREBASE_SMART_BRAIN_SETUP.md - Updated index configuration
- ✅ SMART_BRAIN_QUICK_REFERENCE.md - Updated decision tree
- ✅ test-smart-brain.js - Updated test queries
- ✅ migrate-customers.js - Updated to add invoiceHistory array

---

## ✅ Summary

**Old Approach:**
- NIPT primary → Name fallback
- Separate invoiceHistory collection
- Complex multi-key matching

**New Approach:**
- Name primary → Fuzzy fallback
- invoiceHistory array per customer
- Simple, focused on real-world usage

**Result:**
- ✅ Simpler identification logic
- ✅ Complete purchase history per customer
- ✅ Better analytics capabilities
- ✅ Cleaner database structure

---

**Migration Status:** Ready for deployment  
**Testing Required:** Run migration + deploy indexes + test with real invoice  
**Backward Compatible:** Yes (existing data preserved)

---

**Updated:** February 8, 2026  
**Version:** Smart Brain 1.1 (Name-Based Identification)
