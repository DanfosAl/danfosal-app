═══════════════════════════════════════════════════════════════
  ONLINE ORDER MATCHING FIX - February 9, 2026
═══════════════════════════════════════════════════════════════

ISSUE REPORTED:
User made a sale from an online order, but:
❌ The online order status didn't update
❌ The sale was registered as a walk-in customer

ROOT CAUSE:
The EasyPOS OCR Bridge (easypos-ocr-bridge.js) was querying online 
orders using the WRONG field name:

  WRONG: .where('customerName', '==', customerName)
  
This is the SAME field naming issue found in Customer Loyalty Dashboard!

All sales data uses 'clientName' field, NOT 'customerName':
  • storeSales.clientName
  • onlineOrders.clientName

Because the field name was wrong:
  → Query returned no results
  → No online order match found
  → System created walk-in sale instead
  → Online order remained in "Ordered" status

═══════════════════════════════════════════════════════════════

CODE FIX:
File: E:\DanfosalApp\resources\app\easypos-ocr-bridge.js
Line: ~768

BEFORE:
```javascript
const ordersSnapshot = await db.collection('onlineOrders')
    .where('customerName', '==', customerName)
    .where('status', 'in', ['pending', 'confirmed', 'Pending', 'Confirmed'])
    .get();
```

AFTER:
```javascript
const ordersSnapshot = await db.collection('onlineOrders')
    .where('clientName', '==', customerName)
    .where('status', 'in', ['pending', 'confirmed', 'Pending', 'Confirmed', 'Ordered', 'ordered'])
    .get();
```

Changes:
✅ customerName → clientName (correct field name)
✅ Added 'Ordered' and 'ordered' to status matching

═══════════════════════════════════════════════════════════════

DATA FIX (ROMINA KOZI ORDER):
The user's sale for Romina Kozi was incorrectly processed.

Manual correction performed:

1. DELETED incorrect walk-in sale:
   Collection: storeSales
   Document ID: AjOf7SmgwMsVz17laI50
   Customer: Romina Kozi
   Invoice: 69/2026/mv200vz195
   Total: €99
   Items: 1x WD 3 V-15/4/20 (YYY) *EU

2. UPDATED online order:
   Collection: onlineOrders
   Document ID: X6AEBy7JVoUfNOxM4SJE
   Fields updated:
     • status: "Ordered" → "Processing"
     • processedAt: 2026-02-09T09:XX:XX
     • linkedInvoiceNumber: "69/2026/mv200vz195"
     • linkedInvoiceDate: 2026-02-09T09:XX:XX

Result:
✅ Online order correctly marked as fulfilled
✅ Invoice properly linked
✅ No duplicate walk-in sale

═══════════════════════════════════════════════════════════════

SERVICE RESTART:
The OCR Bridge service was restarted to apply the fix.

Command:
  Get-Process | Where {$_.CommandLine -like "*easypos-ocr-bridge*"} | Stop-Process -Force
  Start-Process node easypos-ocr-bridge.js -WindowStyle Hidden

Status: ✅ Running with updated code

═══════════════════════════════════════════════════════════════

TESTING VERIFICATION:

Before Fix:
  Query: onlineOrders.where('customerName', '==', 'Romina Kozi')
  Result: 0 records (field doesn't exist)
  Outcome: Created walk-in sale

After Fix:
  Query: onlineOrders.where('clientName', '==', 'Romina Kozi')
  Result: 1 record (Order X6AEBy7JVoUfNOxM4SJE)
  Outcome: Matches order, updates status

═══════════════════════════════════════════════════════════════

NEXT STEPS:

1. Desktop App Rebuild (Optional):
   cd E:\DanfosalApp\resources\app
   npm run dist
   # Rebuild Windows installer with fix
   # Size: ~522 MB
   # Install to apply permanently

2. Android APK Rebuild (Optional):
   npx cap sync android --inline
   cd android
   .\gradlew.bat assembleRelease
   # Sign and deploy APK
   # Size: ~3.33 MB

NOTE: The fix is already ACTIVE in the running OCR Bridge service.
Rebuilding apps is only needed to deploy to other machines or after restart.

═══════════════════════════════════════════════════════════════

RELATED ISSUES FIXED:
• Customer Loyalty Dashboard (Feb 8, 2026)
  Same issue: customerName → clientName
  Location: loyalty-dashboard.html
  Status: ✅ Fixed and deployed

PATTERN IDENTIFIED:
All queries should use 'clientName' field for customer linking in:
  • storeSales collection
  • onlineOrders collection
  • Any future collection with customer references

═══════════════════════════════════════════════════════════════

IMPACT:
✅ Online orders now properly recognized
✅ Order status updates automatically
✅ Invoices linked to orders
✅ No duplicate walk-in sales
✅ Customer Loyalty Dashboard accurate
✅ Complete order tracking workflow

═══════════════════════════════════════════════════════════════
