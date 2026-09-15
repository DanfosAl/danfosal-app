# 🚀 Quick Start: Testing AI Features

## Overview
Test all three AI features in 10 minutes!

---

## 1. 🎯 Testing Next Best Action AI (3 minutes)

### Prerequisites
- Have some orders in database (at least 5-10)
- Have products with stock data
- Have customer phone numbers

### Test Steps

1. **Open AI Dashboard**
   ```
   Main Dashboard → 🤖 AI Command Center
   ```

2. **Wait for Analysis** (3-5 seconds)
   - Page will show "Analyzing business data..."
   - Actions will appear automatically

3. **What to Look For**
   ✅ Actions sorted by priority score
   ✅ Critical (red), High (orange), Medium (yellow), Low (blue)
   ✅ Customer names and phone numbers displayed
   ✅ Stock alerts for low inventory
   ✅ Unpaid orders flagged

4. **Expected Results**
   - If you have customers who haven't ordered in 30+ days → Customer follow-up actions
   - If you have products with stock < 5 → Restock alerts
   - If you have unpaid orders → Payment collection actions
   - If you have debtors → Debt collection actions

### Example Output
```
🔴 CRITICAL (Score: 92)
Call João Silva - High-Value Customer Inactive
Last order 45 days ago. Average order: €850.00
Action: Call +351 912 345 678 to check in and offer special promotion
```

---

## 2. ⚠️ Testing Anomaly Detection AI (2 minutes)

### Prerequisites
- At least 7 days of historical order data
- Some variation in daily sales

### Test Steps

1. **View Anomalies Section**
   - Already visible on AI Dashboard
   - Right panel under "Anomaly Alerts"

2. **Wait for Detection** (5-8 seconds)
   - Shows "Detecting anomalies..."
   - Alerts appear when found

3. **What to Look For**
   ✅ Sales comparison (today vs yesterday)
   ✅ Return rate analysis
   ✅ Stock depletion warnings
   ✅ Unusual order patterns
   ✅ Fraud detection alerts

4. **Expected Results**

   **If Today's Sales Are Low**:
   ```
   🟠 WARNING
   Sales Down 35% Today
   Sales lower than usual - monitor closely
   Recommendation: Review marketing activities
   ```

   **If You Have Low Stock**:
   ```
   🔴 CRITICAL
   12 Products Low on Stock
   Multiple items need restocking urgently
   Recommendation: Review reorder list immediately
   ```

   **If Everything is Normal**:
   ```
   ✅ All Clear!
   No anomalies detected in your business data
   ```

---

## 3. 📸 Testing Invoice OCR (5 minutes)

### Prerequisites
- A sample invoice (paper or PDF)
- Device with camera OR invoice image file
- Good lighting if using camera

### Test Steps

#### Method A: Using File Upload (Easier)

1. **Open Scanner**
   ```
   AI Dashboard → 📸 Invoice Scanner button
   OR
   Main Dashboard → 🤖 AI Command Center → Scan Now
   ```

2. **Upload Invoice**
   - Click "Choose File"
   - Select an invoice image (JPG/PNG)
   - Image preview appears

3. **Extract Data**
   - Click "Extract Data" button
   - Wait 15-30 seconds for processing
   - Shows progress: "Scanning image..." → "Extracting data..."

4. **Review Results**
   ✅ Invoice number extracted
   ✅ Date parsed
   ✅ Supplier name identified
   ✅ Line items detected (product, qty, price)
   ✅ Totals calculated
   ✅ Confidence score shown (e.g., "85% - High")

5. **Edit if Needed**
   - Click "Edit Data" button
   - Correct any wrong fields
   - Fix item quantities or prices

6. **Save**
   - Click "Save to Purchase Orders"
   - Confirmation: "✅ Invoice saved successfully!"

#### Method B: Using Camera (Mobile/Tablet)

1. Click "Take Photo" button
2. Position invoice in frame
3. Tap "Capture"
4. Follow steps 3-6 from Method A

### Expected Results

**Sample Invoice Input**:
```
SUPPLIER NAME LTD
Invoice #: INV-2024-001
Date: 15/01/2024

1  Product A    €10.00   €10.00
2  Product B    €25.00   €50.00
3  Product C    €15.00   €45.00

Subtotal: €105.00
VAT (23%): €24.15
Total: €129.15
```

**Expected OCR Output**:
- Invoice Number: `INV-2024-001`
- Date: `2024-01-15`
- Supplier: `SUPPLIER NAME LTD`
- Items:
  - Product A | Qty: 1 | Price: €10.00
  - Product B | Qty: 2 | Price: €25.00
  - Product C | Qty: 3 | Price: €15.00
- Subtotal: €105.00
- Tax: €24.15
- Total: €129.15
- Confidence: 95% (High)

---

## Troubleshooting Test Issues

### ❌ "No actions recommended"

**Problem**: Next Action AI shows empty list

**Solutions**:
1. Add more historical orders (need 5+ orders)
2. Ensure orders have customer names and phones
3. Add products with stock levels
4. Create some unpaid orders (status: "Pending")
5. Add debtors to database

**Quick Fix**: 
```javascript
// In console, check data:
console.log('Orders:', await getDocs(collection(db, 'onlineOrders')));
console.log('Products:', await getDocs(collection(db, 'products')));
```

---

### ❌ "All Clear" in anomalies (but expected alerts)

**Problem**: Anomaly Detection shows no alerts

**Causes**:
- Business is actually running smoothly ✅
- Not enough historical data (need 7+ days)
- Today's sales similar to average

**To Force a Test Alert**:
1. Wait for a low-sales day
2. Or manually adjust threshold in code:
   ```javascript
   // anomaly-detection.js line 13
   salesDrop: 0.10,  // Change from 0.30 to 0.10 (10% drop triggers)
   ```

---

### ❌ Low OCR confidence (<50%)

**Problem**: Invoice scan shows "Low confidence"

**Solutions**:
1. **Better Image Quality**
   - Use good lighting (bright, even)
   - Avoid shadows
   - Keep invoice flat
   - Focus camera properly

2. **Better Angle**
   - Point camera straight down
   - Don't tilt or angle
   - Fill frame with invoice

3. **Invoice Type**
   - Works best with typed invoices
   - Handwritten = low accuracy
   - Clear fonts work better

4. **Manual Review**
   - Even with low confidence, most data is extracted
   - Just review and correct mistakes
   - Click "Edit Data" to fix fields

---

### ❌ OCR initialization failed

**Problem**: "Failed to initialize OCR engine"

**Solutions**:
1. **Check Internet**: Tesseract.js loads from CDN
2. **Refresh Page**: Sometimes initialization times out
3. **Clear Cache**: Browser cache might be corrupted
4. **Try Different Browser**: Chrome works best
5. **Check Console**: Look for specific error messages

---

## Performance Benchmarks

### Expected Load Times

| Feature | Initial Load | Refresh |
|---------|--------------|---------|
| Next Action AI | 3-5 seconds | 3-5 seconds |
| Anomaly Detection | 5-8 seconds | 5-8 seconds |
| Invoice OCR | 15-30 seconds | - |

### Data Volume Impact

| Orders | Products | Load Time |
|--------|----------|-----------|
| 1-100 | 1-50 | 2-3 seconds |
| 100-500 | 50-200 | 5-8 seconds |
| 500-1000 | 200-500 | 8-12 seconds |
| 1000+ | 500+ | 10-15 seconds |

---

## Sample Test Data

### Create Test Scenario

To properly test all features, you need:

#### Orders (At least 10)
- 3 orders from "João Silva" (last one 45 days ago)
- 2 orders from "Maria Santos" (last one 15 days ago)
- 5 recent orders from various customers
- 2 unpaid orders (status: "Pending")
- 1 returned order (status: "Returned")

#### Products (At least 8)
- 2 products with stock = 2 (critical low)
- 3 products with stock = 8 (low)
- 2 products with stock = 50+ (normal)
- 1 product with stock = 100 (overstocked)

#### Customers
- Ensure customer names and phone numbers in orders
- Mix of frequent and infrequent buyers
- Some with 30+ days since last order

#### Debtors (Optional)
- 1-2 debtors with amount > €500

### Quick Data Generator

Run this in browser console on index.html:

```javascript
// Generate test order for customer follow-up
const testOrder = {
    customerName: "João Silva",
    customerPhone: "+351 912 345 678",
    totalPrice: 850,
    status: "Paid",
    timestamp: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000), // 45 days ago
    items: [{ name: "Test Product", quantity: 10, price: 85 }]
};

// Add to Firebase (if needed)
await addDoc(collection(db, 'onlineOrders'), testOrder);
```

---

## Verification Checklist

Use this to verify each feature works:

### ✅ Next Action AI

- [ ] Dashboard loads without errors
- [ ] Actions appear in 3-5 seconds
- [ ] Priority scores visible (0-100)
- [ ] Color-coded by priority (red, orange, yellow, blue)
- [ ] Customer names and phones displayed
- [ ] Product names shown for inventory actions
- [ ] Amounts shown for financial actions
- [ ] Top 3 actions make business sense
- [ ] Refresh button updates recommendations

### ✅ Anomaly Detection AI

- [ ] Alerts appear in 5-8 seconds
- [ ] Severity badges visible (Critical, Warning, Info)
- [ ] Sales comparison shown (today vs historical)
- [ ] Stock alerts for low inventory
- [ ] Recommendations make sense
- [ ] Summary cards update (counts)
- [ ] "All Clear" message if no anomalies
- [ ] Refresh updates detection

### ✅ Invoice OCR

- [ ] Scanner page loads
- [ ] File upload works
- [ ] Camera opens (on mobile/tablet)
- [ ] Image preview displays
- [ ] Processing shows progress bar
- [ ] OCR completes in 15-30 seconds
- [ ] Invoice number extracted
- [ ] Date parsed correctly
- [ ] Supplier name found
- [ ] Line items in table
- [ ] Totals calculated
- [ ] Confidence score displayed
- [ ] Edit button enables fields
- [ ] Save creates purchase order
- [ ] Success confirmation shows

---

## Next Steps After Testing

### If All Tests Pass ✅

1. **Use Daily**
   - Check AI Dashboard every morning
   - Act on top 3-5 recommendations
   - Scan invoices as they arrive

2. **Monitor Performance**
   - Track time saved per week
   - Measure revenue impact
   - Note which recommendations are most valuable

3. **Customize**
   - Adjust alert thresholds if too sensitive
   - Change scoring weights to match priorities
   - Add custom actions for your workflow

### If Tests Fail ❌

1. **Check Console Errors**
   - Press F12 to open developer tools
   - Look for red error messages
   - Note any "undefined" or "null" errors

2. **Verify Firebase**
   - Ensure Firebase config is correct
   - Check Firestore rules allow read/write
   - Confirm collections exist

3. **Test Internet Connection**
   - Tesseract.js requires internet
   - Firebase requires internet
   - Check browser network tab

4. **Browser Compatibility**
   - Use Chrome/Edge (best)
   - Firefox works well
   - Safari may have issues
   - Mobile browsers work for camera features

---

## Support

### Getting Help

1. **Check Console**: Press F12 and look at Console tab for errors
2. **Check Network**: Press F12 and look at Network tab for failed requests
3. **Review Logs**: Look at terminal/console where app is running
4. **Read Documentation**: See `AI_FEATURES_GUIDE.md` for detailed info

### Common Error Messages

| Error | Meaning | Solution |
|-------|---------|----------|
| "db is undefined" | Firebase not initialized | Refresh page |
| "Cannot read property of null" | Data structure issue | Check Firestore data |
| "Tesseract is undefined" | CDN not loaded | Check internet connection |
| "Permission denied" | Firestore rules | Update security rules |

---

## Success! 🎉

If you see:
- ✅ Actions with priority scores
- ✅ Anomaly alerts (or "All Clear")
- ✅ Invoice data extracted from image

**You're ready to go!** Start using these AI features in your daily workflow.

**Time to Value**:
- Week 1: Learn the features
- Week 2-3: Build habits around daily use
- Month 2+: See measurable time savings and revenue impact

Happy automating! 🚀
