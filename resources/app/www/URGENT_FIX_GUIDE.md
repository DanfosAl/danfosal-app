# 🔧 URGENT FIX - Sales Import Issues

## Current Situation Analysis

Based on your screenshots and import results:
- ✅ **1511 sales imported successfully**  
- ❌ **0 online orders** detected (all went to store sales)
- ❌ **Negative sales** showing in Monthly Revenue chart
- ❌ **100% profit margin** (clearly wrong)

## Root Causes Identified

### 1. All Sales Going to "Store Sales" Instead of "Online Orders"
**Problem**: Excel file doesn't have the expected column names for phone/address/city

**Your Excel likely has columns like:**
- `Subjekti` (customer name)
- `Kodi/Llogaria` (product code)  
- `Përshkrimi` (product description)
- `Sasia` (quantity)
- `Cmimi_per_njesi` (unit price)
- `Cmimi_EUR` (total)
- `Data` (date)

**Missing columns for online detection:**
- No `Tel marresi` (phone)
- No `Adresa e marresit` (address)
- No `Qyteti i marresit` (city)

**Solution**: If ALL your sales are actually store sales (in-person), this is CORRECT behavior. But if some have addresses, you need to add those columns to Excel.

### 2. Negative Revenue in Chart
**Problem**: The chart is likely showing PROFIT (price - cost), not REVENUE (price only)

Since imported sales have `cost: 0`, but the chart shows negative values, one of two things is happening:
1. Chart is mislabeled and showing profit, not revenue
2. System is somehow assigning wrong costs to products

### 3. 100% Profit Margin
**Problem**: When cost = 0, profit margin = 100% (completely wrong)

## IMMEDIATE FIX STEPS

### Step 1: Check Your Excel Structure
Open your Excel file and check if you have these columns:
- [ ] `Tel marresi` or `Telefoni` (phone numbers)
- [ ] `Adresa e marresit` or `Adresa` (addresses)  
- [ ] `Qyteti i marresit` or `Qyteti` (cities)

**If YES**: The detection should now work with my fixes. Re-import.
**If NO**: Your sales are correctly imported as store sales.

### Step 2: Add Product Costs to Your Catalog

The negative revenue is happening because costs are missing or wrong. You MUST:

1. Go to **Products** page
2. For EACH product, click Edit
3. Fill in the **Cost** field (your purchase price from supplier)
4. Fill in the **Price** field (your selling price)
5. Fill in the **Product Code** field (must match Excel `Kodi/Llogaria` EXACTLY)

### Step 3: Re-Import with Cleanup

1. Go to **Import Sales History** page
2. ✅ Enable **"FSHI TË GJITHA SHITJET"** (Delete all sales) checkbox
3. Upload your Excel file
4. Check the preview - it will now show which columns were found
5. Click Import

### Step 4: Run Cost Matching Script

After ensuring products have costs, run this in browser console (F12):

```javascript
// Open import-sales-history.html page first, then run this

const { getFirestore, collection, getDocs, doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
const db = getFirestore();

async function fixCosts() {
  // Get products with costs
  const productsSnap = await getDocs(collection(db, 'products'));
  const productsMap = new Map();
  
  let productsWithCost = 0;
  productsSnap.forEach(d => {
    const p = d.data();
    if (p.code) {
      productsMap.set(p.code.toUpperCase(), p);
      if (p.cost && p.cost > 0) productsWithCost++;
    }
    if (p.name) {
      productsMap.set(p.name, p);
    }
  });
  
  console.log(`📦 Found ${productsMap.size} products, ${productsWithCost} have costs`);
  
  // Fix store sales
  const salesSnap = await getDocs(collection(db, 'storeSales'));
  let fixed = 0;
  
  for (const saleDoc of salesSnap.docs) {
    const sale = saleDoc.data();
    if (!sale.items || sale.items.length === 0) continue;
    
    let needsUpdate = false;
    let totalCost = 0;
    
    const updatedItems = sale.items.map(item => {
      const code = (item.code || item.productCode || '').toUpperCase();
      const product = productsMap.get(code) || productsMap.get(item.name || item.product);
      
      if (product) {
        if (!item.cost || item.cost === 0) {
          item.cost = product.cost || 0;
          needsUpdate = true;
        }
        if (!item.price || item.price === 0) {
          item.price = product.price || 0;
          needsUpdate = true;
        }
      }
      
      totalCost += (item.cost || 0) * (item.quantity || 1);
      return item;
    });
    
    if (needsUpdate) {
      await updateDoc(doc(db, 'storeSales', saleDoc.id), {
        items: updatedItems,
        cost: totalCost
      });
      fixed++;
      if (fixed % 50 === 0) console.log(`✅ Fixed ${fixed} sales...`);
    }
  }
  
  // Fix online orders  
  const ordersSnap = await getDocs(collection(db, 'onlineOrders'));
  
  for (const orderDoc of ordersSnap.docs) {
    const order = orderDoc.data();
    if (!order.items || order.items.length === 0) continue;
    
    let needsUpdate = false;
    let totalCost = 0;
    
    const updatedItems = order.items.map(item => {
      const code = (item.code || item.productCode || '').toUpperCase();
      const product = productsMap.get(code) || productsMap.get(item.name || item.product);
      
      if (product) {
        if (!item.cost || item.cost === 0) {
          item.cost = product.cost || 0;
          needsUpdate = true;
        }
        if (!item.price || item.price === 0) {
          item.price = product.price || 0;
          needsUpdate = true;
        }
      }
      
      totalCost += (item.cost || 0) * (item.quantity || 1);
      return item;
    });
    
    if (needsUpdate) {
      await updateDoc(doc(db, 'onlineOrders', orderDoc.id), {
        items: updatedItems,
        cost: totalCost
      });
      fixed++;
      if (fixed % 50 === 0) console.log(`✅ Fixed ${fixed} orders...`);
    }
  }
  
  console.log(`🎉 COMPLETED! Fixed ${fixed} total sales/orders`);
  console.log('Now refresh your dashboard and analytics pages');
}

fixCosts();
```

## What the Fixes Do

### 1. Improved Online Order Detection
Added support for checking:
- `Tel marresi`, `Tel_marresi`, `Telefoni`, `Nr. Tel`, `Phone`
- `Adresa e marresit`, `Adresa`, `Address`, `Vendndodhja`
- `Qyteti i marresit`, `Qyteti`, `City`, `Vend`

### 2. Better Debug Logging
Now shows:
- All Excel columns found
- Whether phone/address/city columns exist
- Whether first row is detected as online or store
- How many of each type imported

### 3. Data Structure Improvements
Every sale now gets:
- `productCode` field (for matching)
- `cost` field (default 0, needs update)
- Proper top-level fields for direct sales queries

## Expected Results After Fix

1. ✅ Products with costs will show correct profit margins
2. ✅ Revenue charts will show positive values
3. ✅ Profit analysis will be accurate
4. ✅ Analytics will have complete data
5. ✅ Online orders detected if Excel has phone/address columns

## If Problems Persist

1. **Take screenshot of import preview** showing the columns detected
2. **Export first 3 rows** of your Excel as CSV and share
3. **Check products page** - ensure all products have:
   - ✅ Name (matches Excel `Përshkrimi`)
   - ✅ Code (matches Excel `Kodi/Llogaria`)
   - ✅ Cost (your purchase price)
   - ✅ Price (your selling price)

## Quick Diagnosis

Run this in console to check your data:

```javascript
const { getFirestore, collection, getDocs } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
const db = getFirestore();

async function diagnose() {
  const [products, sales, orders] = await Promise.all([
    getDocs(collection(db, 'products')),
    getDocs(collection(db, 'storeSales')),
    getDocs(collection(db, 'onlineOrders'))
  ]);
  
  console.log('=== PRODUCTS ===');
  console.log(`Total: ${products.size}`);
  let withCode = 0, withCost = 0, withPrice = 0;
  products.forEach(d => {
    const p = d.data();
    if (p.code) withCode++;
    if (p.cost && p.cost > 0) withCost++;
    if (p.price && p.price > 0) withPrice++;
  });
  console.log(`With code: ${withCode}`);
  console.log(`With cost: ${withCost}`);
  console.log(`With price: ${withPrice}`);
  
  console.log('\n=== STORE SALES ===');
  console.log(`Total: ${sales.size}`);
  let withItems = 0, withCostField = 0;
  sales.forEach(d => {
    const s = d.data();
    if (s.items && s.items.length > 0) withItems++;
    if (s.cost && s.cost > 0) withCostField++;
  });
  console.log(`With items: ${withItems}`);
  console.log(`With cost: ${withCostField}`);
  
  console.log('\n=== ONLINE ORDERS ===');
  console.log(`Total: ${orders.size}`);
  let withAddress = 0, paidOrders = 0;
  orders.forEach(d => {
    const o = d.data();
    if (o.address || o.deliveryAddress) withAddress++;
    if (o.status === 'Paid') paidOrders++;
  });
  console.log(`With address: ${withAddress}`);
  console.log(`Paid status: ${paidOrders}`);
}

diagnose();
```

This will show exactly what's in your database and what's missing.
