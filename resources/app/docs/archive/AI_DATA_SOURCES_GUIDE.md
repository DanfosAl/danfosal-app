# 🔍 AI Features - Data Sources & Customization Guide

## Where Does the Data Come From?

All AI features read from your **Firebase Firestore** database collections:

### 1️⃣ **onlineOrders Collection**
```javascript
Fields used:
- status: "Pending", "Paid", "Shipped", "Returned", "Unpaid"
- timestamp: Order creation date
- customerName: Customer identifier
- customerPhone: Contact number
- totalPrice: Order amount
- items: Array of products ordered
```

### 2️⃣ **products Collection**
```javascript
Fields used:
- name: Product name
- stock: Current inventory level
- costPrice: Purchase cost (optional)
- sellingPrice: Sale price (optional)
```

### 3️⃣ **debtors Collection**
```javascript
Fields used:
- name: Debtor name
- phone: Contact number
- amount: Outstanding debt
- notes: Additional info
```

---

## 🎯 What Each Alert Means

### **Next Actions - Delayed Shipments**

**Alert**: `Ship Order #0IQRLg3f - Delayed`

**Logic**: 
```javascript
// In next-action-ai.js, line 386
if (order.status === 'Paid' && daysOld >= 7) {
    // Alert: Order was paid but not shipped after 7 days
}
```

**Why You See It**:
- Order status = "Paid" (not "Shipped")
- Order was created 7+ days ago
- System assumes it should have been shipped by now

**How to Fix**:
1. **If already shipped**: Update order status to "Shipped" in your database
2. **If not shipped**: Ship it and update status
3. **If doesn't exist**: Delete the order from database

---

### **Anomalies - 149 Products Low on Stock**

**Alert**: `149 Products Low on Stock`

**Logic**:
```javascript
// In anomaly-detection.js, line 451
if (product.stock <= 5 && product.stock > 0) {
    // Alert: Low stock detected
}
```

**Why You See It**:
- 149 products have stock between 1-5 units
- System flags these as needing restocking

**How to Customize**:
```javascript
// Change threshold from 5 to 2 (only alert when 2 or less)
if (product.stock <= 2 && product.stock > 0) {
```

Or increase count needed before alert:
```javascript
// In anomaly-detection.js, line 13
lowStockItems: 20  // Change from 5 to 20
// Now alerts only if 20+ products are low
```

---

## 🔧 Customization Options

### **Option 1: Adjust Thresholds** (Easy)

Edit `anomaly-detection.js` lines 10-17:

```javascript
this.alertThresholds = {
    salesDrop: 0.30,        // 30% drop → Change to 0.40 for 40%
    salesSpike: 2.0,        // 200% spike → Change to 3.0 for 300%
    returnsIncrease: 0.50,  // 50% more returns → Change to 1.0 for 100%
    stockDepletion: 0.70,   // 70% faster usage → Keep or adjust
    orderValueDrop: 0.40,   // 40% value drop → Change to 0.50
    lowStockItems: 5        // 5 items → Change to 10 or 20
};
```

Edit `next-action-ai.js` lines 11-16:

```javascript
this.weights = {
    urgency: 40,    // Time-sensitive → Increase for more urgent focus
    impact: 35,     // Business value → Increase for revenue focus
    effort: 15,     // Ease of task → Increase for easy wins
    opportunity: 10 // Strategic value → Increase for growth focus
};
```

---

### **Option 2: Disable Specific Alerts** (Medium)

#### Disable Delayed Shipment Alerts

Already done! I've commented out the delayed shipment logic above.

#### Disable Low Stock Alerts

In `anomaly-detection.js`, line 451:

```javascript
async getLowStockProducts() {
    // DISABLED: Return empty array to disable low stock alerts
    return [];
    
    /* Original code:
    const productsRef = this.collection(this.db, 'products');
    const snapshot = await this.getDocs(productsRef);
    
    const lowStock = [];
    
    snapshot.forEach(doc => {
        const product = doc.data();
        if (product.stock <= 5 && product.stock > 0) {
            lowStock.push({
                name: product.name,
                stock: product.stock,
                velocity: 0
            });
        }
    });
    
    return lowStock;
    */
}
```

---

### **Option 3: Clean Up Old Data** (Advanced)

#### Update Old "Paid" Orders to "Shipped"

Use the script I created:

1. Open your web app: https://danfosal-app.web.app
2. Press **F12** to open Developer Console
3. Paste the code from `update-old-orders-script.js`
4. Press Enter to run

This will:
- Find all orders with status="Paid" older than 3 days
- Update them to status="Shipped"
- Remove them from the alerts

#### Delete Test/Invalid Orders

```javascript
// Run in browser console
async function deleteInvalidOrders() {
    const ordersRef = collection(db, 'onlineOrders');
    const ordersSnapshot = await getDocs(ordersRef);
    
    const deletePromises = [];
    
    ordersSnapshot.forEach(doc => {
        const order = doc.data();
        
        // Delete if order ID matches your test orders
        if (order.id === '0IQRLg3f' || order.id === 'Z5hIXb79') {
            console.log(`Deleting: ${doc.id}`);
            deletePromises.push(deleteDoc(doc.ref));
        }
    });
    
    await Promise.all(deletePromises);
    console.log(`✅ Deleted ${deletePromises.length} orders`);
}

deleteInvalidOrders();
```

---

## 🎨 How to Implement Properly

### **Best Practice: Use Correct Order Statuses**

Your order workflow should be:

```
Order Created
    ↓
status: "Pending" or "Unpaid"
    ↓
Payment Received
    ↓
status: "Paid"
    ↓
Order Shipped (within 1-3 days)
    ↓
status: "Shipped"
    ↓
Customer Returns (if applicable)
    ↓
status: "Returned"
```

### **Update Orders When Shipping**

In your order management code, when you ship:

```javascript
// In orders_online.html or wherever you manage orders
async function shipOrder(orderId) {
    const orderRef = doc(db, 'onlineOrders', orderId);
    
    await updateDoc(orderRef, {
        status: 'Shipped',
        shippedDate: new Date().toISOString(),
        updatedBy: firebase.auth().currentUser.email
    });
    
    alert('✅ Order marked as shipped!');
}
```

### **Maintain Accurate Stock Levels**

When orders are placed:

```javascript
async function reduceStock(productName, quantity) {
    const productsRef = collection(db, 'products');
    const q = query(productsRef, where('name', '==', productName));
    const snapshot = await getDocs(q);
    
    snapshot.forEach(async (doc) => {
        const currentStock = doc.data().stock;
        await updateDoc(doc.ref, {
            stock: currentStock - quantity,
            lastUpdated: new Date().toISOString()
        });
    });
}
```

---

## 🧪 Testing Your Changes

After making changes:

1. **Save the file** (Ctrl+S)

2. **Copy to www folder**:
```powershell
Copy-Item -Path "public\next-action-ai.js" -Destination "www\next-action-ai.js" -Force
Copy-Item -Path "public\anomaly-detection.js" -Destination "www\anomaly-detection.js" -Force
```

3. **Deploy to web**:
```powershell
npx firebase-tools deploy --only hosting
```

4. **Test**:
   - Open https://danfosal-app.web.app
   - Go to AI Command Center
   - Refresh (Ctrl+F5 to clear cache)
   - Check if alerts changed

---

## 📋 Quick Reference

### Current Alert Settings (Default)

| Alert Type | Threshold | Change in File |
|------------|-----------|----------------|
| Sales Drop | 30% | `anomaly-detection.js` line 13 |
| Low Stock | ≤5 units | `anomaly-detection.js` line 451 |
| Low Stock Count | 5+ products | `anomaly-detection.js` line 17 |
| Delayed Shipment | 7 days | `next-action-ai.js` line 386 (disabled) |
| Unpaid Order | 3-5 days | `next-action-ai.js` line 347 |
| Customer Inactive | 30+ days | `next-action-ai.js` line 86 |

### Recommended Settings for Your Business

Based on typical usage:

```javascript
// More relaxed settings
this.alertThresholds = {
    salesDrop: 0.40,        // 40% (was 30%)
    salesSpike: 3.0,        // 300% (was 200%)
    returnsIncrease: 1.0,   // 100% (was 50%)
    stockDepletion: 0.70,   // Keep
    orderValueDrop: 0.50,   // 50% (was 40%)
    lowStockItems: 20       // 20 items (was 5)
};
```

And in `getLowStockProducts()`:
```javascript
if (product.stock <= 2 && product.stock > 0) {
    // Only alert when 2 or fewer units
}
```

---

## 🎓 Understanding the Alerts

### **Why Are These Alerts Useful?**

1. **Delayed Shipments**: 
   - Prevents customer complaints
   - Ensures timely delivery
   - Maintains reputation

2. **Low Stock**:
   - Prevents stockouts
   - Avoids lost sales
   - Plans reordering

3. **Customer Inactive**:
   - Re-engages high-value customers
   - Prevents churn
   - Increases repeat business

4. **Unpaid Orders**:
   - Improves cash flow
   - Reduces bad debt
   - Tracks payment issues

### **What If I Don't Need Certain Alerts?**

**That's totally fine!** Not every business needs every alert. Disable what you don't need:

- **Small business with few SKUs**: Disable low stock (you track manually)
- **Same-day shipping**: Keep delayed shipment at 1 day
- **All cash sales**: Disable unpaid order alerts
- **Retail only**: Disable customer follow-ups

---

## 🆘 Common Issues & Solutions

### Issue: "Too many low stock alerts"

**Solution**: Increase threshold
```javascript
// From 5 to 2
if (product.stock <= 2 && product.stock > 0) {
```

### Issue: "Don't recognize these order IDs"

**Solution**: Check database directly
1. Go to Firebase Console
2. Open Firestore Database
3. Browse `onlineOrders` collection
4. Search for order ID (e.g., "0IQRLg3f")
5. Delete if invalid OR update status if valid

### Issue: "Alerts for orders I already shipped"

**Solution**: Update order statuses
- Run the `update-old-orders-script.js`
- Or manually update in Firebase Console
- Or update in your app's order management

### Issue: "Too sensitive alerts"

**Solution**: Adjust thresholds (see above)

---

## 🚀 Next Steps

1. **Choose your preference**:
   - Keep alerts as-is (most comprehensive)
   - Adjust thresholds (balanced)
   - Disable unwanted alerts (custom)

2. **Clean up data**:
   - Update old "Paid" orders to "Shipped"
   - Delete any test/invalid orders
   - Ensure products have accurate stock

3. **Test**:
   - Make changes
   - Deploy to web
   - Check AI Dashboard
   - Verify alerts match your needs

4. **Refine**:
   - Use for 1 week
   - Note which alerts are useful
   - Adjust accordingly

---

Need help with any of these steps? Let me know!
