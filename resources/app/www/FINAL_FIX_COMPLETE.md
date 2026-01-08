# ✅ FINAL FIXES - December 2, 2025

## What I Fixed

### 1. ✅ Online Order Detection
Added detection for `Emri i marresit` (receiver name) field - if this field has data, the sale is treated as an online order even without phone/address.

**Your file structure detected:**
```
Columns in shitje_me_adresa_online.xlsx:
- Kodi/Llogaria (product code)
- Përshkrimi (product name)
- Sasia (quantity - can be negative for returns)
- Subjekti (business customer - for invoicing)
- Cmimi_EUR (total price)
- Cmimi_per_njesi (unit price)
- Data (date)
- SaleDate
- Emri i marresit (receiver name - actual person receiving)
- Adresa e marresit (delivery address)
- Qyteti i marresit (city)
- Tel marresi (phone)
- Koha e Krijimit
- OrderDate
```

**Detection logic now:**
- If has `Tel marresi` OR `Adresa e marresit` OR `Qyteti i marresit` OR `Emri i marresit` → **ONLINE ORDER**
- Otherwise → **STORE SALE**

### 2. ✅ Negative Sales Fixed (Returns Handling)
Your negative quantities are RETURNS, not negative revenue!

**Now handles:**
- Negative `Sasia` (quantity) → Detected as return
- Uses `Math.abs()` to store positive quantities
- Sets status to `Returned` for online orders with negative qty
- Adds `isReturn: true` flag for store sales
- Revenue is always stored as positive (absolute value)
- Logs returns with 🔄 KTHIM label

### 3. ✅ Customer Name Logic
**For online orders:**
- Uses `Emri i marresit` (person receiving delivery)
- Falls back to `Subjekti` if receiver name is empty

**For store sales:**
- Uses `Subjekti` (business customer)

### 4. ✅ All Column Variations Supported
Added Albanian special characters support: `marrësi`, `marrësi`, etc.

## How to Import Your Data

### Step 1: Prepare Products Catalog
**CRITICAL**: Before importing sales, ensure EVERY product has:

1. Go to **Products** page
2. For each product, fill in:
   - ✅ **Name** (must match Excel `Përshkrimi` exactly)
   - ✅ **Code** (must match Excel `Kodi/Llogaria` exactly)
   - ✅ **Cost** (your purchase price from supplier)
   - ✅ **Price** (your selling price to customers)
   - ✅ **Producer** (manufacturer/brand)

**Example:**
```
Name: KM 85/50 R Bp Pack 2 SB
Code: 1.351-128.0
Cost: 8500
Price: 11200
Producer: Kärcher
```

### Step 2: Import Sales Data

1. **Open Import Sales History page**
2. **Enable "FSHI TË GJITHA SHITJET"** (Delete all) checkbox
   - This removes old incorrect data
   - Only do this ONCE
3. **Upload**: `shitje_me_adresa_online.xlsx`
4. **Watch the log** - it will show:
   - Columns detected
   - Online vs Store detection
   - Progress with return indicators
5. **Wait for completion**

**Expected result:**
```
✅ U importuan X porosi online
✅ U importuan Y shitje dyqan
📊 Returns will show as "🔄 KTHIM"
```

### Step 3: Match Costs to Sales

After import, run this script in browser console (F12) on any page:

```javascript
const { getFirestore, collection, getDocs, doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
const db = getFirestore();

async function matchCosts() {
  console.log('🔄 Loading products...');
  const productsSnap = await getDocs(collection(db, 'products'));
  const codeMap = new Map();
  const nameMap = new Map();
  
  let productsWithData = 0;
  productsSnap.forEach(d => {
    const p = d.data();
    if (p.code && (p.cost > 0 || p.price > 0)) {
      codeMap.set(p.code.toUpperCase(), p);
      productsWithData++;
    }
    if (p.name) {
      nameMap.set(p.name, p);
    }
  });
  
  console.log(`📦 Found ${productsWithData} products with cost/price data`);
  
  if (productsWithData === 0) {
    console.error('❌ NO PRODUCTS HAVE COSTS! Please add costs to products first.');
    return;
  }
  
  // Update store sales
  console.log('🏪 Updating store sales...');
  const salesSnap = await getDocs(collection(db, 'storeSales'));
  let updated = 0, matched = 0, notFound = 0;
  
  for (const saleDoc of salesSnap.docs) {
    const sale = saleDoc.data();
    if (!sale.items || sale.items.length === 0) continue;
    
    let needsUpdate = false;
    let totalCost = 0;
    
    const updatedItems = sale.items.map(item => {
      const code = (item.code || item.productCode || '').toUpperCase();
      const product = codeMap.get(code) || nameMap.get(item.name || item.product);
      
      if (product) {
        matched++;
        if (!item.cost || item.cost === 0) {
          item.cost = product.cost || 0;
          needsUpdate = true;
        }
        if (!item.price || item.price === 0) {
          item.price = product.price || 0;
          needsUpdate = true;
        }
      } else {
        notFound++;
        console.warn(`⚠️ Product not found: ${item.name} [${code}]`);
      }
      
      totalCost += (item.cost || 0) * (item.quantity || 1);
      return item;
    });
    
    if (needsUpdate) {
      await updateDoc(doc(db, 'storeSales', saleDoc.id), {
        items: updatedItems,
        cost: totalCost
      });
      updated++;
      if (updated % 100 === 0) {
        console.log(`✅ Updated ${updated} sales...`);
      }
    }
  }
  
  // Update online orders
  console.log('📦 Updating online orders...');
  const ordersSnap = await getDocs(collection(db, 'onlineOrders'));
  
  for (const orderDoc of ordersSnap.docs) {
    const order = orderDoc.data();
    if (!order.items || order.items.length === 0) continue;
    
    let needsUpdate = false;
    let totalCost = 0;
    
    const updatedItems = order.items.map(item => {
      const code = (item.code || item.productCode || '').toUpperCase();
      const product = codeMap.get(code) || nameMap.get(item.name || item.product);
      
      if (product) {
        matched++;
        if (!item.cost || item.cost === 0) {
          item.cost = product.cost || 0;
          needsUpdate = true;
        }
        if (!item.price || item.price === 0) {
          item.price = product.price || 0;
          needsUpdate = true;
        }
      } else {
        notFound++;
      }
      
      totalCost += (item.cost || 0) * (item.quantity || 1);
      return item;
    });
    
    if (needsUpdate) {
      await updateDoc(doc(db, 'onlineOrders', orderDoc.id), {
        items: updatedItems,
        cost: totalCost
      });
      updated++;
      if (updated % 100 === 0) {
        console.log(`✅ Updated ${updated} orders...`);
      }
    }
  }
  
  console.log(`\n🎉 COMPLETED!`);
  console.log(`✅ Updated ${updated} total sales/orders`);
  console.log(`✅ Matched ${matched} products`);
  if (notFound > 0) {
    console.warn(`⚠️ ${notFound} products not found in catalog`);
  }
  console.log('\n🔄 Refresh your dashboard and analytics!');
}

matchCosts();
```

## Expected Results

After completing all steps:

### ✅ Dashboard
- Shows correct number of pending orders
- Positive revenue values
- Accurate profit margins (not 100%)

### ✅ Orders Page
- Online orders have addresses
- Customer names show receiver names
- Returns marked with "Returned" status

### ✅ Business Intelligence
- **Monthly Sales Revenue**: All positive, no negatives
- **Profitability Analysis**: Realistic margins (20-50%)
- **Map**: Shows cities with online orders

### ✅ Advanced Analytics
- All sections populated with data
- Product performance shows top sellers
- Geographic analysis shows city distribution

## Troubleshooting

### If still shows 0 online orders:
1. Check browser console (F12) during import
2. Look for the line: `📋 Kolonat e gjetura në Excel`
3. Verify it shows: `Emri i marresit`, `Tel marresi`, `Adresa e marresit`
4. Check: `📦 Rreshti i parë detektohet si: 🌐 ONLINE` or `🏪 DYQAN`

### If still shows negative revenue:
1. Products don't have costs - fill them in Products page
2. Run the cost matching script above
3. Check console for "⚠️ Product not found" warnings
4. Those products need to be added to catalog with correct codes

### If profit margins are wrong:
1. Verify product costs are correct in Products page
2. Cost should be LESS than Price
3. Run cost matching script again
4. Check for products with `cost: 0` - they'll show 100% margin

## Data Quality Checks

Run this to verify your data:

```javascript
const { getFirestore, collection, getDocs } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
const db = getFirestore();

async function checkData() {
  const [products, sales, orders] = await Promise.all([
    getDocs(collection(db, 'products')),
    getDocs(collection(db, 'storeSales')),
    getDocs(collection(db, 'onlineOrders'))
  ]);
  
  console.log('=== PRODUCTS ===');
  console.log(`Total: ${products.size}`);
  const prodIssues = [];
  products.forEach(d => {
    const p = d.data();
    if (!p.code) prodIssues.push(`${p.name} - missing code`);
    if (!p.cost || p.cost === 0) prodIssues.push(`${p.name} - missing cost`);
    if (!p.price || p.price === 0) prodIssues.push(`${p.name} - missing price`);
  });
  if (prodIssues.length > 0) {
    console.warn(`⚠️ ${prodIssues.length} products with issues:`);
    prodIssues.slice(0, 10).forEach(i => console.warn(`  - ${i}`));
  } else {
    console.log('✅ All products have code, cost, and price');
  }
  
  console.log('\n=== ONLINE ORDERS ===');
  console.log(`Total: ${orders.size}`);
  let withAddress = 0, paidOrders = 0, returns = 0;
  orders.forEach(d => {
    const o = d.data();
    if (o.address || o.deliveryAddress) withAddress++;
    if (o.status === 'Paid') paidOrders++;
    if (o.status === 'Returned') returns++;
  });
  console.log(`With address: ${withAddress}`);
  console.log(`Paid: ${paidOrders}`);
  console.log(`Returns: ${returns}`);
  
  console.log('\n=== STORE SALES ===');
  console.log(`Total: ${sales.size}`);
  let withCost = 0, storeReturns = 0;
  sales.forEach(d => {
    const s = d.data();
    if (s.cost && s.cost > 0) withCost++;
    if (s.isReturn) storeReturns++;
  });
  console.log(`With cost: ${withCost}`);
  console.log(`Returns: ${storeReturns}`);
}

checkData();
```

## Summary

✅ **FIXED**: Online order detection with `Emri i marresit`
✅ **FIXED**: Returns handling (negative quantities)
✅ **FIXED**: Revenue always positive (uses absolute values)
✅ **FIXED**: Customer name logic (receiver for online, Subjekti for store)
✅ **FIXED**: All Albanian character variations

**Next:** Import your data and run cost matching script!
