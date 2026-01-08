# 🧹 Cleanup Instructions

## Step 1: Delete Test Orders

1. **Open your web app**: https://danfosal-app.web.app

2. **Log in** to your account

3. **Open Browser Console**:
   - Press `F12` on your keyboard
   - Or right-click anywhere → "Inspect" → "Console" tab

4. **Copy and paste this entire script**:

```javascript
// DELETE TEST ORDERS SCRIPT
async function deleteTestOrders() {
    const testOrderIds = [
        '0IQRLg3f', 'Z5hIXb79', 'Z7Txu6TH', '4Bn41n5Z', '4IqRh5F9',
        '5c0AvaL8', '5dLhZAMK', '7pIdWNwB', 'AeHzUBF3', 'C0WO72SW'
    ];
    
    console.log('🗑️ Deleting test orders...');
    
    const ordersRef = collection(db, 'onlineOrders');
    const snapshot = await getDocs(ordersRef);
    
    let deleted = 0;
    
    for (const docSnapshot of snapshot.docs) {
        const orderId = docSnapshot.id;
        const shouldDelete = testOrderIds.some(testId => orderId.startsWith(testId));
        
        if (shouldDelete) {
            await deleteDoc(docSnapshot.ref);
            deleted++;
            console.log(`✓ Deleted: ${orderId}`);
        }
    }
    
    alert(`✅ Deleted ${deleted} test orders!`);
}

deleteTestOrders();
```

5. **Press Enter** to run

6. **Wait** for confirmation message

7. **Refresh AI Dashboard** (Ctrl+F5) to see clean recommendations

---

## Step 2: Understanding the New Stock Alerts

### ✅ **What Changed**

**BEFORE** (Old Logic):
```
Alert if stock <= 5 units
❌ Problem: Alerts for slow-moving items that never sell
```

**AFTER** (New Logic - Sales-Based):
```
Alert if:
1. Product has sold in last 90 days (velocity > 0.1 units/day)
2. Stock will run out in < 14 days at current sales rate
✅ Benefit: Only alerts for items that actually sell
```

### 📊 **Examples**

**Product A**: 
- Stock: 3 units
- Sales last 90 days: 0 units
- **Result**: ✅ NO ALERT (doesn't sell, low stock is fine)

**Product B**:
- Stock: 50 units
- Sales last 90 days: 180 units (2 per day)
- Days until stockout: 50 / 2 = 25 days
- **Result**: ✅ NO ALERT (25 days > 14 days threshold)

**Product C**:
- Stock: 10 units
- Sales last 90 days: 90 units (1 per day)
- Days until stockout: 10 / 1 = 10 days
- **Result**: 🔴 ALERT! (10 days < 14 days, needs restocking)

**Product D** (Karcher SC 3):
- Stock: 1 unit
- Sales last 90 days: 0 units
- **Result**: ✅ NO ALERT (zero sales = intentionally low stock)

---

## Step 3: Verify Everything Works

1. **Delete test orders** (Step 1 above)

2. **Refresh AI Dashboard**:
   - Go to https://danfosal-app.web.app
   - Click "🤖 AI Command Center"
   - Press Ctrl+F5 (hard refresh)

3. **Expected Results**:
   - ✅ NO "Ship Order #..." alerts (test orders deleted)
   - ✅ Stock alerts only for fast-selling items
   - ✅ Slow-moving items (1-2 stock) ignored
   - ✅ Customer follow-ups (if applicable)
   - ✅ Other relevant business alerts

---

## 🎯 Customization Options

### Adjust Sales Threshold

If you want to be even more selective, edit `anomaly-detection.js` line 490:

```javascript
// Current: Alert if sells > 0.1 per day (~3 per month)
if (dailyVelocity > 0.1 && stock > 0) {

// More selective: Alert only if sells > 0.5 per day (~15 per month)
if (dailyVelocity > 0.5 && stock > 0) {

// Very selective: Alert only if sells > 1 per day (~30 per month)
if (dailyVelocity > 1.0 && stock > 0) {
```

### Adjust Days Warning

Change from 14 days to 7 days (line 495):

```javascript
// Current: Alert 14 days before stockout
if (daysUntilStockout < 14) {

// More urgent: Alert only 7 days before
if (daysUntilStockout < 7) {

// Earlier warning: Alert 21 days before
if (daysUntilStockout < 21) {
```

### Adjust Minimum Alert Count

Change from 5 products to 10 (anomaly-detection.js line 17):

```javascript
// Current: Alert if 5+ products running low
lowStockItems: 5

// Less sensitive: Alert only if 10+ products
lowStockItems: 10

// More sensitive: Alert if 3+ products
lowStockItems: 3
```

---

## 📝 Summary

### What the AI Now Does:

✅ **Ignores slow-moving items** (products that sell once a year)
✅ **Alerts only for active sellers** (products with consistent sales)
✅ **Calculates days until stockout** (based on actual sales velocity)
✅ **Prioritizes urgent items** (sorted by days remaining)
✅ **Shows sales data** (displays units sold in last 90 days)

### What You Need to Do:

1. ✅ Run the delete script (Step 1)
2. ✅ Refresh AI Dashboard
3. ✅ Verify clean recommendations
4. ✅ (Optional) Adjust thresholds to your preference

---

## 🆘 Troubleshooting

### "Script doesn't work in console"

Make sure you're on: https://danfosal-app.web.app
(Not on Firebase Console or other pages)

### "Still seeing test orders"

They might have different IDs. To delete ALL old orders:

```javascript
async function deleteAllOldPaidOrders() {
    const ordersRef = collection(db, 'onlineOrders');
    const snapshot = await getDocs(ordersRef);
    const now = Date.now();
    
    let deleted = 0;
    
    for (const doc of snapshot.docs) {
        const order = doc.data();
        const orderTime = order.timestamp?.toMillis() || order.timestamp;
        const daysOld = (now - orderTime) / (1000 * 60 * 60 * 24);
        
        // Delete if: Paid status AND older than 30 days
        if (order.status === 'Paid' && daysOld >= 30) {
            await deleteDoc(doc.ref);
            deleted++;
            console.log(`✓ Deleted: ${doc.id} (${Math.round(daysOld)} days old)`);
        }
    }
    
    alert(`Deleted ${deleted} old orders!`);
}

deleteAllOldPaidOrders();
```

### "Too many / too few stock alerts"

Adjust the thresholds in Step 3 above.

---

**All done!** Your AI will now give you smart, sales-based recommendations. 🎉
