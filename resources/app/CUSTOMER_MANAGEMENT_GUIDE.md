# Customer Management Overhaul - Complete Guide

## Overview

The Danfosal app now features a **360-degree customer management system** that organizes customers by name and maintains complete purchase history.

---

## 🎯 Key Features

### 1. **Name-Based Customer Identification**
- **Primary Key:** Customer Name (case-insensitive, trimmed)
- **Optional Metadata:** NIPT (tax number)
- **Automatic Deduplication:** Fuzzy name matching prevents duplicate entries
- **Invoice History Tracking:** Each customer has an `invoiceHistory` array

### 2. **Complete Purchase History**
Every customer record maintains:
- ✅ `invoiceHistory` array - All tracked invoice numbers
- ✅ `lastInvoiceDate` - ISO timestamp of most recent invoice
- ✅ Linked to all store sales (by customerName)
- ✅ Linked to all online orders (by customerName)

### 3. **360-Degree Customer View**
Search by name to instantly retrieve:
- Customer profile (name, NIPT, contact info, address)
- All tracked invoices (from Smart Brain processing)
- Complete store sales history (from EasyPOS imports)
- Complete online orders history (from web/app orders)
- Total revenue and transaction count

---

## 📁 Database Structure

### Customer Document Schema
```javascript
{
  id: "auto-generated",
  name: "Customer Name", // PRIMARY KEY for matching
  nipt: "L12345678X",    // Optional tax ID
  email: "customer@example.com",
  phone: "+355 69 XXX XXXX",
  address: "Street, City, Country",
  status: "Active",
  source: "easypos-import",
  createdAt: "2026-02-08T15:36:17.269Z",
  invoiceHistory: [       // Array of invoice numbers
    "54/2026/mv200vz195",
    "55/2026/mv200vz196"
  ],
  lastInvoiceDate: "2026-02-08T15:46:21.198Z"
}
```

### Store Sales Schema
```javascript
{
  customerName: "Customer Name", // Links to customer
  items: [...],
  total: 340,
  date: "2025-02-03",
  timestamp: Timestamp,
  isReturn: false,
  source: "imported"
}
```

### Online Orders Schema
```javascript
{
  customerName: "Customer Name", // Links to customer
  items: [...],
  total: 150,
  orderDate: "2025-05-09",
  timestamp: Timestamp,
  phoneNumber: "0697007230",
  deliveryAddress: "Street Address",
  status: "Paid",
  source: "imported"
}
```

---

## 🔧 Management Tools

### 1. **Database Audit**
```bash
npm run audit-customers
```
**Purpose:** Scan customer database for:
- Duplicate customers (by name)
- Customers missing invoiceHistory arrays
- Data quality statistics

**Output:**
- Total customer count
- Customers with/without invoiceHistory
- List of duplicate groups

---

### 2. **Merge Duplicates**
```bash
npm run merge-duplicates
```
**Purpose:** Consolidate duplicate customer records into single entries.

**Process:**
1. Groups customers by normalized name
2. Selects primary record (most complete data)
3. Merges invoiceHistory arrays (unique only)
4. Keeps most recent lastInvoiceDate
5. Deletes duplicate records

**Safety:** 5-second countdown before execution (Ctrl+C to cancel)

---

### 3. **Link Historical Invoices**
```bash
npm run link-historical-invoices
```
**Purpose:** Scan existing sales/orders and populate customer invoiceHistory.

**Process:**
1. Loads all customers into memory
2. Scans storeSales collection
3. Scans onlineOrders collection
4. Matches by customerName (case-insensitive)
5. Updates invoiceHistory arrays with unique entries

**Note:** For imported data without invoice numbers, this links by customer name only.

---

### 4. **View Customer Profile (360°)**
```bash
npm run view-customer "Customer Name"
```
**Example:**
```bash
npm run view-customer "Valmira"
```

**Output:**
```
========================================
👤 Customer Information
========================================
ID:              Rp9odw9CD7mJpmmzeURe
Name:            Valmira
NIPT:            (none)
Phone:           (none)
Email:           (none)
Address:         Tirane, Trane, ALB
Status:          Active
Last Invoice:    2026-02-08T15:46:21.198Z

========================================
📋 Tracked Invoice History
========================================
Total: 1 invoice(s)
  1. 54/2026/mv200vz195

========================================
🏪 Store Sales History
========================================
Total: 15 sale(s)
  1. 2025-02-03 - €340.00 (2 item(s))
     • SC 2 EasyFix *EU x2 @ €159
  ...
  💰 Total Store Revenue: €5,100.00

========================================
🛒 Online Orders History
========================================
Total: 8 order(s)
  1. 2025-05-09 - €150.00 (3 item(s)) [Paid]
     📞 0697007230
     📍 Rr. Tefta Tashko, Tirane
     • Product A x2 @ €50
  ...
  💰 Total Online Revenue: €1,200.00

========================================
📊 Customer Summary
========================================
Total Transactions:     24
  • Store Sales:         15
  • Online Orders:       8
  • Tracked Invoices:    1
========================================
```

---

### 5. **Inspect Data Structure**
```bash
npm run inspect-data
```
**Purpose:** View sample documents from each collection to understand field structure.

**Output:**
- Sample storeSale with all fields
- Sample onlineOrder with all fields
- Sample customer with all fields

---

## 🤖 Smart Brain Automation

### How It Works

When a new invoice is printed from EasyPOS:

1. **Receipt Capture** → Print Capture Service intercepts print job
2. **OCR Processing** → Tesseract extracts text and invoice data
3. **Smart Brain Analysis:**
   - ✅ Check for duplicate invoice (searches all customers' invoiceHistory)
   - ✅ Detect returns/cancellations (negative total, keywords)
   - ✅ **Find/Create Customer BY NAME** (exact → fuzzy → create new)
   - ✅ Add invoice to customer's invoiceHistory array
   - ✅ Match online order (if items + customer match)
   - ✅ Create storeSale or update order status
4. **Firebase Save** → All data saved with customer linkage

### Customer Matching Logic

```javascript
// PRIMARY: Exact name match
WHERE name == "Customer Name"

// FALLBACK: Fuzzy name match (case-insensitive, trimmed)
WHERE name.toLowerCase().trim() == "customer name"

// NO MATCH: Create new customer
CREATE customer with:
  - name: "Customer Name"
  - nipt: optional
  - invoiceHistory: []
  - source: "easypos-import"
```

### Invoice History Update

```javascript
// Retrieve customer
customer = getCustomer(customerId)

// Check duplicate
if (customer.invoiceHistory.includes(invoiceNumber)) {
  return // Already processed
}

// Add to history
customer.invoiceHistory.push(invoiceNumber)
customer.lastInvoiceDate = NOW()

// Save
update(customer)
```

---

## 🔍 Search Optimization

### Firebase Indexes

All necessary composite indexes are configured:

1. **customers.invoiceHistory** (array-contains) - Fast duplicate detection
2. **customers.name** (ascending) - Fast name lookups
3. **storeSales.customerName + timestamp** (desc) - Ordered sales history
4. **onlineOrders.customerName + timestamp** (desc) - Ordered orders history
5. **onlineOrders.customerName + status** - Filter by order status

**Deployment:**
```bash
cd E:\DanfosalApp\resources\app
firebase deploy --only firestore:indexes --project danfosal-app
```

**Note:** Indexes take 5-30 minutes to build after deployment.

---

## 📊 Current Database Status

**Last Audit Results:**
- **Total Customers:** 2
- **With invoiceHistory:** 2 (100%)
- **Duplicates:** 0
- **Store Sales:** 1,232
- **Online Orders:** 269

All customers are properly configured with invoiceHistory arrays.

---

## 🚀 Workflow Examples

### Example 1: Print New Invoice
1. Cashier prints invoice from EasyPOS
2. Smart Brain processes receipt automatically
3. Customer found by name "John Doe"
4. Invoice #56/2026/mv200vz197 added to John's invoiceHistory
5. Sale saved with customerId link

### Example 2: View Customer History
```bash
npm run view-customer "John Doe"
```
Returns complete profile with all transactions across all systems.

### Example 3: Audit Before Cleanup
```bash
npm run audit-customers
```
Identifies 3 duplicate "ABC Company" entries.

```bash
npm run merge-duplicates
```
Merges into single record with combined invoice history.

---

## 🔒 Data Integrity

### Duplicate Prevention

1. **Name-Based Matching:** Primary key prevents duplicates at creation
2. **Fuzzy Matching:** Case-insensitive comparison catches variations
3. **Invoice History:** array-contains queries prevent reprocessing
4. **Audit Tools:** Regular audits identify any duplicates

### Invoice Tracking Guarantees

- ✅ Each invoice number appears only once per customer
- ✅ invoiceHistory arrays contain unique values only
- ✅ lastInvoiceDate always reflects most recent transaction
- ✅ Duplicate invoices detected before processing

---

## 📝 Migration History

**February 8, 2026:**
1. Initial Smart Brain implementation (NIPT-based)
2. Pivoted to Name-based identification
3. Added invoiceHistory array per customer
4. Migrated existing customers (2 total)
5. Deployed Firebase indexes
6. Created 360-degree customer view tools

**Status:** ✅ Production ready

---

## 🛠️ Maintenance Commands

```bash
# Daily Operations
npm run bridge                    # Start OCR Bridge
npm run view-customer "Name"      # View customer profile

# Weekly Maintenance
npm run audit-customers           # Check data quality
npm run merge-duplicates          # Clean up duplicates (if any)

# Monthly Analysis
npm run inspect-data              # Review data structure
npm run link-historical-invoices  # Re-link any missing history

# Development
npm run verify-invoice            # Test Smart Brain processing
npm run test-smart-brain          # Firebase permissions test
```

---

## 📞 Support & Troubleshooting

### Issue: Customer not found
**Solution:** Check name spelling (case-insensitive, but must match)

### Issue: Duplicate customers appearing
**Solution:** Run `npm run merge-duplicates`

### Issue: Missing purchase history
**Solution:** Run `npm run link-historical-invoices`

### Issue: Indexes not working (collection scans)
**Solution:** Check Firebase Console → Indexes are "Enabled"

---

## 🎯 Success Criteria

✅ **Search by name returns complete history**
- Customer profile loaded
- All invoices listed
- All store sales shown
- All online orders shown

✅ **No duplicate customers**
- Unique names in database
- Merged records where needed

✅ **Complete invoice tracking**
- Every customer has invoiceHistory
- New invoices automatically added
- Duplicate detection working

✅ **Performance optimized**
- Firebase indexes deployed
- Queries execute in <500ms
- No collection scans

---

## 📈 Future Enhancements

Potential additions:
- Customer lifetime value (CLV) calculation
- Purchase frequency analysis
- Product preferences per customer
- Automated marketing segments
- Revenue forecasting per customer
- Customer churn prediction

---

**System Owner:** Danfosal App  
**Last Updated:** February 8, 2026  
**Version:** 1.4.0  
**Status:** ✅ Production Ready
