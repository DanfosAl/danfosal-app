# 🔥 Firebase Setup for Smart Brain System

This guide walks you through setting up Firebase Collections and Indexes for the Smart Brain invoice processing system.

---

## 📋 Required Actions

### 1. Create Firebase Indexes

Firebase indexes are **required** for efficient querying. Without them, some queries will fail.

#### Option A: Using Firebase CLI (Recommended)

1. **Install Firebase CLI** (if not already installed):
   ```powershell
   npm install -g firebase-tools
   ```

2. **Login to Firebase**:
   ```powershell
   firebase login
   ```

3. **Create `firestore.indexes.json`** in your project root:

   ```powershell
   cd E:\DanfosalApp\resources\app
   ```

   Create file: `firestore.indexes.json`

   ```json
   {
     "indexes": [
       {
         "collectionGroup": "invoiceHistory",
         "queryScope": "COLLECTION",
         "fields": [
           { "fieldPath": "invoiceNumber", "order": "ASCENDING" },
           { "fieldPath": "processedAt", "order": "DESCENDING" }
         ]
       },
       {
         "collectionGroup": "returns",
         "queryScope": "COLLECTION",
         "fields": [
           { "fieldPath": "type", "order": "ASCENDING" },
           { "fieldPath": "timestamp", "order": "DESCENDING" }
         ]
       },
       {
         "collectionGroup": "customers",
         "queryScope": "COLLECTION",
         "fields": [
           { "fieldPath": "nipt", "order": "ASCENDING" }
         ]
       },
       {
         "collectionGroup": "customers",
         "queryScope": "COLLECTION",
         "fields": [
           { "fieldPath": "name", "order": "ASCENDING" }
         ]
       },
       {
         "collectionGroup": "onlineOrders",
         "queryScope": "COLLECTION",
         "fields": [
           { "fieldPath": "customerName", "order": "ASCENDING" },
           { "fieldPath": "status", "order": "ASCENDING" }
         ]
       }
     ],
     "fieldOverrides": []
   }
   ```

4. **Deploy indexes**:
   ```powershell
   firebase deploy --only firestore:indexes --project danfosal-app
   ```

5. **Wait for indexes to build** (can take 5-30 minutes):
   - Check status: https://console.firebase.google.com/project/danfosal-app/firestore/indexes

---

#### Option B: Using Firebase Console (Manual)

1. **Go to Firebase Console**: https://console.firebase.google.com/project/danfosal-app/firestore/indexes

2. **Create each index manually**:

   **Index 1: invoiceHistory**
   - Click "Add Index"
   - Collection: `invoiceHistory`
   - Field 1: `invoiceNumber` - Ascending
   - Field 2: `processedAt` - Descending
   - Query scope: Collection
   - Click "Create"

   **Index 2: returns**
   - Click "Add Index"
   - Collection: `returns`
   - Field 1: `type` - Ascending
   - Field 2: `timestamp` - Descending
   - Query scope: Collection
   - Click "Create"

   **Index 3: customers (NIPT)**
   - Click "Add Index"
   - Collection: `customers`
   - Field 1: `nipt` - Ascending
   - Query scope: Collection
   - Click "Create"

   **Index 4: customers (Name)**
   - Click "Add Index"
   - Collection: `customers`
   - Field 1: `name` - Ascending
   - Query scope: Collection
   - Click "Create"

   **Index 5: onlineOrders**
   - Click "Add Index"
   - Collection: `onlineOrders`
   - Field 1: `customerName` - Ascending
   - Field 2: `status` - Ascending
   - Query scope: Collection
   - Click "Create"

3. **Wait for indexes to build**

---

### 2. Update Firestore Security Rules

1. **Go to Firestore Rules**: https://console.firebase.google.com/project/danfosal-app/firestore/rules

2. **Add these rules** (append to existing rules):

   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       
       // Existing rules...
       
       // Smart Brain Collections
       match /invoiceHistory/{docId} {
         allow read, write: if request.auth != null;
       }
       
       match /returns/{docId} {
         allow read, write: if request.auth != null;
       }
       
       match /stock/{docId} {
         allow read: if request.auth != null;
         allow write: if request.auth != null; // Smart Brain can update on returns
       }
       
       // Enhanced customers collection (ensure write access)
       match /customers/{docId} {
         allow read, write: if request.auth != null;
       }
       
       // Enhanced onlineOrders (ensure write access for status updates)
       match /onlineOrders/{docId} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```

3. **Click "Publish"**

---

### 3. Initialize Collections (Optional but Recommended)

Pre-create collections to verify permissions:

**Run this in Firebase Console** (Firestore → Start collection):

1. **invoiceHistory** - Add one test document:
   ```json
   {
     "invoiceNumber": "TEST-001",
     "action": "test",
     "processedAt": "2026-02-08T00:00:00Z"
   }
   ```
   Then delete it after verifying.

2. **returns** - Add one test document:
   ```json
   {
     "type": "return",
     "timestamp": [Auto-generated Timestamp]
   }
   ```
   Then delete it.

3. **stock** - Add one test document:
   ```json
   {
     "productId": "test-product",
     "quantity": 0,
     "lastUpdated": [Auto-generated Timestamp]
   }
   ```
   Then delete it.

---

### 4. Update Existing Customer Records

If you have existing customers without the `nipt` field:

**Option A: Using Firebase Console**
1. Go to Firestore → customers collection
2. For each customer, click "Edit"
3. Add field: `nipt` (string) - leave empty if unknown
4. Save

**Option B: Using Firebase CLI Script**

Create `migrate-customers.js`:

```javascript
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function migrateCustomers() {
  const snapshot = await db.collection('customers').get();
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    
    // Add nipt field if missing
    if (!data.nipt) {
      await doc.ref.update({ nipt: '' });
      console.log(`Updated customer: ${doc.id}`);
    }
  }
  
  console.log('Migration complete!');
}

migrateCustomers().catch(console.error);
```

Run with:
```powershell
cd E:\DanfosalApp\resources\app
node migrate-customers.js
```

---

## ✅ Verification Checklist

After completing setup, verify everything is working:

### 1. Test Index Creation

```powershell
# Check if indexes are building
firebase firestore:indexes --project danfosal-app
```

Expected output:
```
┌─────────────────────┬────────┬────────────────┬─────────┐
│ Index Name          │ Status │ Fields         │ Scope   │
├─────────────────────┼────────┼────────────────┼─────────┤
│ invoiceHistory_idx  │ READY  │ invoiceNumber, │ COLLECT │
│                     │        │ processedAt    │         │
└─────────────────────┴────────┴────────────────┴─────────┘
...
```

### 2. Test Database Permissions

Run this test script: `test-smart-brain.js`

```javascript
const { initializeFirebase, getFirestore } = require('./firebase-admin-config');

async function testPermissions() {
  initializeFirebase();
  const db = getFirestore();
  
  console.log('Testing database permissions...\n');
  
  // Test 1: Write to invoiceHistory
  try {
    const ref = await db.collection('invoiceHistory').add({
      invoiceNumber: 'TEST-PERM-001',
      action: 'test',
      processedAt: new Date().toISOString()
    });
    console.log('✓ invoiceHistory: Write OK');
    await ref.delete(); // Clean up
  } catch (error) {
    console.log('✗ invoiceHistory: Write FAILED', error.message);
  }
  
  // Test 2: Write to returns
  try {
    const ref = await db.collection('returns').add({
      type: 'test',
      timestamp: new Date()
    });
    console.log('✓ returns: Write OK');
    await ref.delete();
  } catch (error) {
    console.log('✗ returns: Write FAILED', error.message);
  }
  
  // Test 3: Write to stock
  try {
    const ref = await db.collection('stock').add({
      productId: 'test-123',
      quantity: 0
    });
    console.log('✓ stock: Write OK');
    await ref.delete();
  } catch (error) {
    console.log('✗ stock: Write FAILED', error.message);
  }
  
  // Test 4: Query customers by NIPT
  try {
    const snapshot = await db.collection('customers')
      .where('nipt', '==', 'TEST123')
      .limit(1)
      .get();
    console.log('✓ customers: NIPT query OK');
  } catch (error) {
    console.log('✗ customers: NIPT query FAILED', error.message);
  }
  
  console.log('\nAll tests complete!');
}

testPermissions().catch(console.error);
```

Run with:
```powershell
cd E:\DanfosalApp\resources\app
node test-smart-brain.js
```

Expected output:
```
Testing database permissions...

✓ invoiceHistory: Write OK
✓ returns: Write OK
✓ stock: Write OK
✓ customers: NIPT query OK

All tests complete!
```

### 3. Test Smart Brain with Real Invoice

1. **Restart OCR Bridge**:
   ```powershell
   # Stop existing bridge
   Stop-Process -Name node -Force
   
   # Start bridge
   cd E:\DanfosalApp\resources\app
   npm run bridge
   ```

2. **Print a test invoice** from EasyPOS

3. **Check logs** for Smart Brain messages:
   ```powershell
   Get-Content C:\Danfosal\Logs\easypos-ocr-bridge.log -Tail 30
   ```

   Expected log pattern:
   ```
   [INFO] 🧠 [SMART BRAIN] Analyzing invoice...
   [INFO]    🔍 Searching for existing customer...
   [INFO]    ✓ Found by name: [customer] → [id]
   [INFO]    🔍 Searching for matching online orders...
   [INFO]    → No pending online orders for [customer]
   [INFO]    📝 Registering as new walk-in sale...
   [INFO]    ✓ Sale created: [saleId]
   [INFO]    ✓ Invoice history updated
   [SUCCESS] ✅ Database save complete!
   ```

4. **Verify in Firebase Console**:
   - Check `invoiceHistory` - should have new entry
   - Check `storeSales` - should have new sale
   - Check `customers` - should have `nipt` field

---

## 🚨 Common Issues

### Issue: "Missing or insufficient permissions"

**Cause:** Security rules not updated or indexes not created

**Fix:**
1. Re-publish security rules (see section 2)
2. Wait for indexes to build (check Firebase Console)
3. Verify service account has proper permissions

---

### Issue: "Index not found" error in logs

**Cause:** Firebase index not yet built

**Fix:**
1. Go to Firebase Console → Firestore → Indexes
2. Check if any indexes are "Building" - wait for completion
3. If failed, delete and recreate the index

---

### Issue: Customer duplicates still being created

**Cause:** Existing customers don't have `nipt` field

**Fix:**
Run migration script (see section 4) to add `nipt` field to all existing customers

---

### Issue: Test script fails with "Cannot find module"

**Cause:** Dependencies not installed

**Fix:**
```powershell
cd E:\DanfosalApp\resources\app
npm install
```

---

## 📊 Monitoring

### Daily Checks

1. **Check invoice history**:
   ```powershell
   # View recent processed invoices
   Get-Content C:\Danfosal\Logs\easypos-ocr-bridge.log | Select-String "SMART BRAIN"
   ```

2. **Check for duplicates**:
   ```powershell
   Get-Content C:\Danfosal\Logs\easypos-ocr-bridge.log | Select-String "DUPLICATE"
   ```

3. **Check returns**:
   ```powershell
   Get-Content C:\Danfosal\Logs\easypos-ocr-bridge.log | Select-String "RETURN DETECTED"
   ```

4. **Check online order matches**:
   ```powershell
   Get-Content C:\Danfosal\Logs\easypos-ocr-bridge.log | Select-String "ONLINE ORDER MATCHED"
   ```

### Firebase Console Monitoring

- **Recent invoices**: https://console.firebase.google.com/project/danfosal-app/firestore/data/invoiceHistory
- **Recent returns**: https://console.firebase.google.com/project/danfosal-app/firestore/data/returns
- **Stock levels**: https://console.firebase.google.com/project/danfosal-app/firestore/data/stock

---

## 🎯 Next Steps

After completing this setup:

1. ✅ Indexes created and built
2. ✅ Security rules updated
3. ✅ Collections initialized
4. ✅ Permissions tested
5. ✅ Smart Brain tested with real invoice

**You're ready to use the Smart Brain system!** 🎉

Proceed to [SMART_BRAIN_GUIDE.md](SMART_BRAIN_GUIDE.md) for usage and testing scenarios.

---

**Setup Version:** 1.0  
**Last Updated:** February 8, 2026  
**Compatible with:** Firebase Admin SDK 12.x, Node.js 18+
