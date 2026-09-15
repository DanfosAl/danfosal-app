# 📦 Smart Inventory Scanner - Complete Guide

## Overview

The **Smart Inventory Scanner** automatically updates your inventory from supplier invoices (like Kärcher). It:

1. **Scans** supplier invoice (photo or PDF)
2. **Extracts** product codes, names, quantities, unit prices
3. **Shows confirmation screen** for you to review
4. **Matches product codes** with existing inventory
5. **For matched products**: Updates stock quantity + cost price
6. **For new products**: Adds to inventory with auto-calculated selling price (cost + 20% tax + 40% profit)

---

## 🚀 Quick Start

### Step 1: Open Smart Inventory Scanner
1. Go to https://danfosal-app.web.app
2. Click **"🤖 AI Command Center"**
3. Click **"📦 Smart Inventory"** → **"Scan Invoice"**

### Step 2: Upload Your Invoice
- **Desktop**: Click "Choose File" → Select invoice image/PDF
- **Mobile**: Click "Take Photo" → Camera opens → Snap invoice

### Step 3: Review Extracted Data
- AI shows supplier name, invoice number, date
- **Table of products** with:
  - ✅ **Green badge "Matched"** = Product exists in inventory
  - ➕ **Blue badge "New"** = Product will be added
- Review quantities, prices, codes

### Step 4: Confirm & Save
- Edit supplier name if needed
- Click **"Confirm & Save to Inventory"**
- Done! Stock updated automatically

---

## 📊 How It Works

### For Your Kärcher Invoice Example:

**What AI Extracts:**
```
Supplier: Kärcher d.o.o. Samobor
Invoice No: 22901/U1/0003
Date: 07.10.2025

Products:
┌──────────────┬────────────────────────┬─────┬──────────┐
│ Code         │ Product Name           │ Qty │ Cost     │
├──────────────┼────────────────────────┼─────┼──────────┤
│ 0.033-709.0  │ 90 Y Promo Fold Up     │  1  │ €23.50   │
│ 0.019-310.0  │ Display Camper         │  1  │ €120.00  │
│ 0.019-503.0  │ Chimney Display        │  1  │ €30.21   │
└──────────────┴────────────────────────┴─────┴──────────┘
```

### Matching Logic:

#### Scenario 1: Product Code Matches
```javascript
// You have product with code "0.033-709.0" in inventory
→ AI finds match
→ Updates:
  - Stock: 10 → 11 (+1 unit)
  - Base Cost: €23.50
  - Cost+VAT: €28.20 (€23.50 × 1.20)
  - Selling Price: Unchanged (your existing price)
```

#### Scenario 2: No Code Match, Name Match
```javascript
// You have "Display Camper" but no code
→ AI matches by name
→ Updates:
  - Stock: 5 → 6 (+1 unit)
  - Base Cost: €120.00
  - Cost+VAT: €144.00
  - Code: "0.019-310.0" (added from invoice)
```

#### Scenario 3: New Product
```javascript
// "Chimney Display" not in inventory
→ AI calculates prices:
  - Base Cost: €30.21 (from invoice)
  - Cost+VAT: €36.25 (€30.21 × 1.20) = +20% tax
  - Selling Price: €50.75 (€36.25 × 1.40) = +40% profit
→ Adds new product:
  - Code: "0.019-503.0"
  - Name: "Chimney Display"
  - Producer: "Kärcher d.o.o. Samobor"
  - Stock: 1
```

---

## 🎯 Pricing Formula

### Automatic Price Calculation (for new products):

```
Base Cost (from invoice)
    ↓
    × 1.20 (add 20% VAT)
    ↓
Cost with VAT
    ↓
    × 1.40 (add 40% profit)
    ↓
Selling Price
```

**Example:**
```
Base Cost: €100
Cost+VAT: €100 × 1.20 = €120
Selling Price: €120 × 1.40 = €168

Your profit: €168 - €120 = €48 (40% of cost with VAT)
```

**You can edit the selling price** before saving if you want different margins.

---

## 📝 Product Codes

### Why Product Codes Matter:
- **Fast matching**: AI instantly finds products by code
- **No mistakes**: Eliminates name variations ("Display Camper" vs "Camper Display")
- **Multi-supplier**: Same product from different suppliers? Code stays same

### Adding Codes to Existing Products:

#### Method 1: Smart Scanner (Automatic)
When you scan an invoice and AI matches by name, it automatically adds the code from the invoice.

#### Method 2: Manual Entry
1. Go to **Products** page
2. Click **Edit** on product
3. Enter code in **"Product Code"** field (e.g., `0.033-709.0`)
4. Save

### Code Format:
- Kärcher uses: `0.033-709.0` (numbers with dots/dashes)
- Other suppliers may use: `ABC1234`, `KIT-500`, etc.
- AI supports all formats

---

## 🔍 What Gets Extracted

### From Invoice Header:
✅ **Supplier name** (e.g., "Kärcher d.o.o.")  
✅ **Invoice number** (e.g., "22901/U1/0003")  
✅ **Date** (e.g., "07.10.2025")

### From Product Lines:
✅ **Product code** (Material No.)  
✅ **Product name** (Description)  
✅ **Quantity** (how many units)  
✅ **Unit price** (cost per unit in EUR)  

### NOT Extracted (ignored):
❌ **Total price** (we calculate from quantity × unit price)  
❌ **Taxes/fees** (already included in base cost)  
❌ **Delivery details** (not needed for inventory)

---

## 🎨 Review Screen Explained

### Stats Cards:
```
┌─────────────────┬─────────────────┬─────────────────┐
│  Total Items    │ Matched Products│  New Products   │
│       3         │        1        │        2        │
└─────────────────┴─────────────────┴─────────────────┘
```

### Products Table:

| Status | Code | Product | Qty | Unit Cost | Cost+VAT | Selling Price | Action |
|--------|------|---------|-----|-----------|----------|---------------|--------|
| ✓ Matched | 0.033-709.0 | Promo Fold Up | 1 | €23.50 | €28.20 | €35.00 | Update stock: 10 → 11 |
| + New | 0.019-503.0 | Chimney Display | 1 | €30.21 | €36.25 | €50.75 | Add to inventory |

**Status Colors:**
- 🟢 **Green "Matched"** = Product found in your inventory (will update)
- 🔵 **Blue "New"** = Product not in inventory (will add)

---

## ⚙️ Settings & Customization

### Change Profit Margin:
Edit `smart-inventory-scanner.js` line ~327:
```javascript
// Current: 40% profit
const sellingPrice = costWithVAT * 1.40;

// Change to 30% profit:
const sellingPrice = costWithVAT * 1.30;

// Change to 50% profit:
const sellingPrice = costWithVAT * 1.50;
```

### Change VAT Rate:
Edit line ~325:
```javascript
// Current: 20% VAT
const costWithVAT = baseCost * 1.20;

// Change to 25% VAT:
const costWithVAT = baseCost * 1.25;
```

After editing, redeploy:
```powershell
Copy-Item -Path "public\smart-inventory-scanner.js" -Destination "www\smart-inventory-scanner.js" -Force
npx firebase-tools deploy --only hosting
```

---

## 🛠️ Troubleshooting

### "Failed to scan invoice"
**Possible causes:**
1. **Image too blurry** → Retake photo with better focus
2. **Poor lighting** → Use natural light or lamp
3. **PDF too complex** → Try scanning first page only

**Solutions:**
- Take photo from directly above (not at angle)
- Ensure all text is readable
- Use high resolution (not zoomed in screenshot)

### AI Doesn't Extract All Products
**Why:** Complex table layouts confuse OCR

**Your invoice has:**
- Material numbers
- Country of origin
- Statistic numbers
- Multiple columns

**Solution:**
1. AI extracts supplier, invoice #, date ✅
2. **Manually add products** that weren't detected:
   - Click "+" button in review screen (future feature)
   - Or skip those items and add manually in Products page

### Wrong Product Match
**Example:** AI matches "Display Camper" to wrong product

**Before Saving:**
1. Review table carefully
2. If match is wrong, **don't save**
3. Add product code to correct product first:
   - Go to Products page
   - Edit correct product
   - Add code from invoice
   - Retry scan

**After Saving (if you noticed late):**
1. Go to Products page
2. Find wrongly updated product
3. **Edit** → Correct stock quantity manually
4. Add correct code to prevent future mistakes

### Duplicate Products Created
**Cause:** AI couldn't match existing product (no code, name different)

**Prevention:**
- Add product codes to all products
- Use consistent naming (avoid variations)

**Cleanup:**
1. Go to Products page
2. Delete duplicate
3. Transfer stock to original product manually

---

## 💡 Pro Tips

### Tip 1: Add Codes Gradually
- Scan 1-2 invoices per week
- Each scan adds codes automatically
- After 2-3 months, most products will have codes
- Future scans will be 90%+ automatic

### Tip 2: Review First Invoice Carefully
- Your first scan from each supplier: review everything
- Verify prices, names, codes
- Fix any mistakes before saving
- Next invoices from same supplier will be more accurate

### Tip 3: Use Scanner for Bulk Orders
**Perfect for:**
- Monthly supplier orders (50+ items)
- Restocking multiple products
- New product batches

**Not ideal for:**
- Single item orders (faster to add manually)
- Handwritten invoices
- Invoices without product codes

### Tip 4: Keep Invoice Photos
- Save original invoice images
- If AI missed something, you can re-scan
- Or manually add products with correct codes

### Tip 5: Verify Cost Updates
- Scanner updates costs automatically
- If supplier changed price, check if selling price needs adjustment
- Go to Products page → Edit → Update price if needed

---

## 📊 Example Workflow

### Your Weekly Kärcher Order:

**Monday Morning:**
1. Receive Kärcher invoice (email PDF or paper)
2. Open Smart Inventory Scanner on phone
3. Take photo of invoice (or upload PDF on desktop)

**AI Processing (30 seconds):**
```
Scanning invoice...
Found supplier: Kärcher d.o.o. Samobor
Invoice: 22901/U1/0003
Date: 07.10.2025
Extracted 12 products
Matched 9 existing products
Found 3 new products
```

**Review Screen (2 minutes):**
- Check quantities: ✅
- Check prices: ✅
- New products look right: ✅
- Click "Confirm & Save"

**Result:**
```
✅ Inventory Updated!
9 Products Updated (stock +quantities, costs refreshed)
3 Products Added (with auto-calculated prices)
```

**Total time saved:** ~15 minutes vs manual entry

---

## 🔐 Data Privacy

**Where does scanning happen?**
- OCR runs **in your browser** (client-side)
- Invoice image never uploaded to external server
- Only extracted data (codes, names, quantities) saved to your Firebase

**Who can see my invoices?**
- Nobody. Images stay on your device.
- Only you can access your Firebase data

**Can I scan sensitive invoices?**
- Yes. All processing is local.
- No data leaves your control except to your own Firebase database

---

## 🚀 Future Improvements (Coming Soon)

### Planned Features:
1. **Manual add button** in review screen (add missed products)
2. **Edit quantities** before saving (adjust if invoice has errors)
3. **Multi-page PDF** support (scan entire invoice stack)
4. **Batch scanning** (scan 5 invoices, confirm all at once)
5. **History** (see past scanned invoices)
6. **Statistics** (total cost per supplier, monthly spend)

---

## 📞 Support

### Having Issues?
1. **Check browser console** (F12 → Console tab)
   - Shows detailed extraction logs
   - Copy errors for troubleshooting

2. **Test with sample invoice**
   - Use your Kärcher invoice from screenshots
   - Should extract: Supplier, Invoice #, 3 products

3. **Verify Firebase connection**
   - Go to Products page
   - Can you see existing products?
   - If not, Firebase may be disconnected

---

## 🎯 Success Criteria

**You'll know it's working when:**
✅ You scan an invoice in under 1 minute  
✅ AI matches 80%+ of products automatically  
✅ Stock quantities update correctly  
✅ Costs reflect latest supplier prices  
✅ You save 10+ minutes per invoice  

**Perfect scan:**
- Supplier name correct
- All products detected
- All quantities correct
- All codes matched
- One click to save

---

**Happy scanning! 📦✨**

**Last Updated:** November 10, 2025  
**Scanner Version:** 1.0.0  
**Supported Suppliers:** Kärcher, and any supplier with product codes
