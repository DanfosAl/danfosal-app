# 📸 Invoice OCR - User Guide

## What's Improved (Nov 10, 2025)

### Better Pattern Recognition for Supplier Invoices

Your **Kärcher invoice** (Format: `22901/U1/0003`) is now supported with:

✅ **Multi-format Invoice Numbers:**
- Simple: `INV-12345`
- Complex: `22901/U1/0003` (like your Kärcher invoices)
- With backslashes: `2025\INV\0042`
- With prefixes: `Order No. 7571085019`

✅ **International Date Formats:**
- European: `07.10.2025` (like Kärcher uses)
- US: `10/07/2025`
- ISO: `2025-10-07`
- Short: `07/10/25`

✅ **Better Company Name Detection:**
- Recognizes: `KÄRCHER`, `DANFOS SH.P.K.`, company types (`GmbH`, `Ltd`, `d.o.o.`, `P.K.`)
- Multilingual: English, German, French, Albanian

✅ **Currency Support:**
- EUR (€), USD ($), GBP (£)
- Handles both comma and dot decimals (23,50 or 23.50)

---

## 🎯 How to Use Invoice Scanner

### Step 1: Access the Scanner
1. Open **AI Command Center** from main page
2. Click **"📸 Scan Invoice"** button at top

### Step 2: Capture/Upload Invoice
- **On Mobile**: Click "Take Photo" → Camera opens → Snap invoice
- **On Desktop**: Click "Upload File" → Select image (JPG, PNG, PDF)

### Step 3: Let AI Extract Data
- Wait for "Scanning Invoice..." (10-60 seconds depending on complexity)
- AI extracts:
  - Invoice number
  - Date
  - Supplier name
  - Line items (products, quantities, prices)
  - Total amount

### Step 4: Review & Edit
- **Green fields** = High confidence (AI found it)
- **Yellow fields** = Low confidence (double-check)
- **Red fields** = Not found (manual entry needed)
- Edit any field before saving

### Step 5: Save to Database
- Click **"Save Invoice"**
- Data stored in Firestore → `purchaseOrders` collection
- Can link to products later

---

## 📋 What Works Best

### ✅ Good Invoice Images:
- **High resolution** (at least 1200x1600 pixels)
- **Good lighting** (no shadows or glare)
- **Straight angle** (not tilted)
- **Clear text** (not blurry)
- **Full page** visible

### ⚠️ Challenging Cases:
- Handwritten invoices (OCR struggles with handwriting)
- Multi-page invoices (scan page 1 with totals, enter items manually)
- Low-quality photos (blurry, dark, folded paper)
- Invoices with complex tables (like your Kärcher invoice with 3 items)

---

## 🔧 Tips for Your Kärcher Invoices

Your supplier invoice has:
- Invoice No: `22901/U1/0003` ✅ Now recognized
- Date: `07.10.2025` ✅ Now recognized  
- Supplier: `Kärcher d.o.o.` ✅ Should detect company name
- Items: 3 products with Material No., Description, Quantity, Unit Price, Total Price

### Best Practice:
1. **Scan the first page** (has invoice number, date, supplier, totals)
2. **AI extracts header info** automatically
3. **Manually enter line items** (complex table format is hard for OCR)
   - AI may catch simple items, but verify quantities/prices
4. **Double-check total** matches printed amount (173.71 EUR in your example)

### Why Manual Entry for Items?
Your Kärcher invoice has:
- Material numbers: `0.033-709.0`
- Country of origin: `Germany`
- Statistic numbers: `48196000`
- Multiple columns

OCR works best with **simple formats**:
```
1x Product Name    €23.50
2x Another Item    €45.00
```

Complex tables need manual review for accuracy.

---

## 🎓 Understanding Confidence Score

After scanning, you'll see a **confidence percentage**:

- **80-100%** 🟢 High Confidence
  - Invoice number found ✅
  - Date recognized ✅
  - Supplier identified ✅
  - Items extracted ✅
  - Total detected ✅
  - → Safe to use, just quick review

- **50-79%** 🟡 Medium Confidence
  - Some fields found, others missing
  - → Review yellow fields carefully before saving

- **0-49%** 🔴 Low Confidence
  - Most fields not detected
  - → Better to enter manually (click "Enter Manually" instead)

---

## 🚀 When to Use OCR vs Manual Entry

### Use OCR When:
✅ You have 5+ invoices to process (saves time)
✅ Invoices have clear, standard format
✅ You're on mobile (camera is handy)
✅ Invoice is from a regular supplier (AI learns patterns)

### Use Manual Entry When:
✅ Handwritten invoice
✅ Invoice is complex (like detailed supplier invoices)
✅ You only have 1-2 invoices to enter
✅ OCR fails repeatedly (some invoice formats are too unique)

**Both methods save to the same database - choose what's faster for you!**

---

## 🔍 Troubleshooting

### "Failed to process invoice"
**Cause:** Image quality too low, or OCR couldn't extract any text

**Solutions:**
1. **Retake photo** with better lighting
2. **Straighten the invoice** on a flat surface
3. **Use desktop upload** (higher quality than phone camera)
4. **Click "Enter Manually"** instead

### "No items detected - manual entry required"
**Cause:** Invoice has complex table layout (like your Kärcher invoice)

**This is normal!** Just:
1. AI extracted invoice #, date, supplier, total ✅
2. Click **"+ Add Item"** button to enter products manually
3. Save when done

### "Invoice number not found - generated automatically"
**Cause:** Invoice uses non-standard format

**Solution:**
- AI generates `INV-1731261234` (timestamp-based)
- **Edit it** to match your invoice number (e.g., `22901/U1/0003`)
- System accepts any format

### Confidence score is 30-40%
**This means:** Only 1-2 fields detected (usually supplier name or date)

**Best action:** Click "Enter Manually" - will be faster than correcting 5 fields

---

## 📊 Behind the Scenes

### What AI Does:
1. **Tesseract.js** reads text from image (same engine as Google Docs OCR)
2. **Pattern recognition** with 50+ regex patterns:
   - Invoice numbers: 8 patterns
   - Dates: 5 patterns  
   - Suppliers: 5 patterns + name detection
   - Prices: Currency-aware parsing
   - Totals: 6 patterns
3. **Validation & cleanup** (removes garbage, normalizes dates)
4. **Confidence scoring** (tells you how reliable extraction is)

### Processing Time:
- **Mobile photo**: 15-30 seconds
- **Desktop upload**: 10-20 seconds  
- **Large invoice (2MB+)**: 30-60 seconds

The AI runs **in your browser** (not on server) - so it works offline once loaded!

---

## 💡 Pro Tips

### Tip 1: Scan Multiple Invoices at Once
- Open scanner
- Take photo #1 → Review → Save
- Click "Scan Another" 
- Take photo #2 → Review → Save
- Repeat for all invoices in your pile

### Tip 2: Create Templates for Regular Suppliers
After saving 3-4 Kärcher invoices:
- System learns their format
- Future scans will be more accurate
- Confidence scores improve over time

### Tip 3: Use Good Lighting
- Natural daylight > Fluorescent > Tungsten
- Avoid shadows from your hand/phone
- Use desk lamp if scanning at night

### Tip 4: Photo from Above
- Hold phone parallel to invoice (not at angle)
- Invoice should fill 80% of frame
- All 4 corners visible

### Tip 5: Check the Total First
- AI might extract 8/10 items correctly
- If **total matches**, items are probably right
- If **total is wrong**, review each item

---

## 🎯 Your Specific Use Case

Based on your **Kärcher invoice** example:

### What Will Work Automatically:
✅ Invoice No: `22901/U1/0003`  
✅ Date: `07.10.2025`  
✅ Customer: `DANFOS SH.P.K.`  
✅ Total: `173.71 EUR`  
✅ Supplier: `Kärcher d.o.o.` or extracted from header

### What Needs Manual Entry:
📝 Line Items:
- **Item 1**: 90 Y Promo Fold Up Pillar × 1 PC = €23.50
- **Item 2**: Display Camper × 1 PC = €120.00  
- **Item 3**: Chimney Display × 1 PC = €30.21

**Why?** Complex table with material numbers, country info, statistics

### Recommended Workflow:
1. 📸 **Scan invoice** (captures header automatically)
2. ✅ **Verify** invoice #, date, supplier, total
3. ➕ **Click "Add Item"** 3 times (one per product)
4. 💾 **Save** to database

**Time saved:** ~60% compared to full manual entry (header data auto-filled)

---

## 📞 Need Help?

If OCR consistently fails for your invoices:
1. **Check this guide** first (troubleshooting section)
2. **Try manual entry** (might be faster for your format)
3. **Take sample photos** of successful vs failed scans
4. **Adjust lighting/angle** based on what works

Remember: **OCR is a time-saver, not a requirement!** If manual entry is faster for your invoices, use that instead. Both methods are equally valid. 🎯

---

**Last Updated:** November 10, 2025  
**OCR Engine:** Tesseract.js 5.0  
**Supported Languages:** English, German, French, Albanian (auto-detected)
