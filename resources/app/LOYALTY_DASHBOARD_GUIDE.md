# Customer Loyalty & Top Products Dashboard - Complete Guide

## Overview

The **Customer Loyalty Dashboard** provides instant insights into your best customers and most popular Kärcher products. This real-time analytics system identifies high-value customers and trending equipment to help drive business decisions.

---

## 🎯 Key Features

### 1. **Top 10 Customers Analysis**
- Ranked by **total spend** (primary) and **invoice count** (secondary)
- Shows both store sales and online orders revenue
- Displays transaction count and invoice history
- Real-time updates as OCR Bridge processes new invoices

### 2. **Top 5 Products Analysis**
- Aggregates products purchased by Top 10 customers only
- Ranks by **total revenue** generated
- Shows quantity sold and order frequency
- Ideal for identifying trending Kärcher equipment

### 3. **Business Insights Summary**
- Total customer count and revenue
- Top 10 customer concentration (% of total revenue)
- Average revenue per customer
- Best customer and top product spotlights

### 4. **Dual Interface**
- **CLI Report** - Console-based table view for quick analysis
- **Web Dashboard** - Beautiful visual dashboard with auto-refresh

---

## 🚀 Quick Start

### CLI Report (Command Line)

```bash
cd E:\DanfosalApp\resources\app
npm run loyalty-dashboard
```

**Output:**
```
========================================
  CUSTOMER LOYALTY & TOP PRODUCTS
  Dashboard Report
========================================

Top 10 Customers by Total Spend:
┌─────────┬──────┬───────────────┬─────────────────┬──────────┐
│ Rank    │ Customer          │ Total Spend (€) │ Invoices │
├─────────┼───────────────────┼─────────────────┼──────────┤
│ 1       │ 'John Doe'        │ '5,234.50'      │ 15       │
│ 2       │ 'ABC Company'     │ '3,890.00'      │ 12       │
...

Top 5 Products (from Top 10 Customers):
┌─────────┬────────────────────┬──────────┬──────────────┐
│ Rank    │ Product            │ Total Qty│ Revenue (€)  │
├─────────┼────────────────────┼──────────┼──────────────┤
│ 1       │ 'SC 2 EasyFix'     │ 45       │ '7,155.00'   │
│ 2       │ 'K5 Premium'       │ 32       │ '6,240.00'   │
...
```

---

### Web Dashboard (Visual)

**Access:**
1. Open Danfosal app at http://localhost:8080 (or your app URL)
2. Click **"🏆 Customer Loyalty"** button on homepage
3. Or directly navigate to `loyalty-dashboard.html`

**Features:**
- 📊 Summary metrics (4 key indicators)
- 👥 Top 10 customers with visual ranking (🥇🥈🥉)
- 📦 Top 5 products from top customers
- 🌟 Best customer spotlight card
- 🎯 Top product spotlight card
- 🔄 Auto-refresh every 5 minutes
- 📱 Responsive mobile design

**Direct URL:**
```
http://localhost:8080/loyalty-dashboard.html
```

---

## 📊 How It Works

### Data Sources

1. **Customers Collection** (`customers`)
   - Primary source for customer profiles
   - Uses `invoiceHistory` array for invoice count
   - Name-based identification (primary key)

2. **Store Sales Collection** (`storeSales`)
   - EasyPOS imported sales
   - Links to customers via `customerName` field
   - Provides transaction totals and product items

3. **Online Orders Collection** (`onlineOrders`)
   - Web/app orders
   - Links to customers via `customerName` field
   - Adds to total customer spend

### Ranking Algorithm

**Top 10 Customers:**
```javascript
Sort by:
  1. Total Spend (Store Sales + Online Orders) - PRIMARY
  2. Invoice Count (from invoiceHistory array) - SECONDARY
  
Take top 10 results
```

**Top 5 Products:**
```javascript
1. Collect all items purchased by Top 10 customers
2. Aggregate by product name:
   - Sum quantities
   - Sum revenue (quantity × price)
   - Count orders
3. Sort by total revenue (highest first)
4. Take top 5 results
```

---

## 🔄 Real-Time Updates

### Automatic Data Refresh

**Web Dashboard:**
- Auto-refreshes every **5 minutes**
- Manual refresh button available
- Updates triggered on page load

**OCR Bridge Integration:**
When a new invoice is processed:
1. Customer record updated (invoiceHistory array)
2. Sale saved to storeSales collection
3. Next dashboard load reflects new data
4. Rankings may shift based on new totals

---

## 📈 Use Cases

### 1. **Identify VIP Customers**
```bash
npm run loyalty-dashboard
```
→ See top spenders for targeted marketing, special offers, or loyalty rewards.

### 2. **Stock Management**
Check Top 5 Products list
→ Ensure high-demand Kärcher equipment is always in stock.

### 3. **Sales Strategy**
View Top 10 customer concentration %
→ Assess business diversification (e.g., "Top 10 = 80% of revenue")

### 4. **Product Trends**
Review product rankings over time
→ Identify seasonal trends or emerging bestsellers.

### 5. **Customer Retention**
Monitor lastInvoiceDate for top customers
→ Reach out if inactive for >30 days.

---

## 🛠️ Technical Details

### File Structure

```
E:\DanfosalApp\resources\app\
├── loyalty-dashboard.js           # Node.js CLI script
├── package.json                   # npm scripts configuration
└── www/
    ├── index.html                 # Homepage (with link to loyalty)
    └── loyalty-dashboard.html     # Web dashboard UI
```

### API Integration

The CLI script can be imported as a module:

```javascript
const LoyaltyDashboard = require('./loyalty-dashboard');

const dashboard = new LoyaltyDashboard();
const data = await dashboard.getData();

// Returns:
{
  topCustomers: [
    { rank: 1, name: 'John Doe', totalSpend: 5234.50, ... },
    ...
  ],
  topProducts: [
    { rank: 1, name: 'SC 2 EasyFix', totalRevenue: 7155.00, ... },
    ...
  ],
  summary: {
    totalCustomers: 150,
    totalRevenue: 125000.00,
    top10Revenue: 55000.00,
    top10Percentage: 44.0
  }
}
```

### Firebase Indexes

Required indexes (already deployed):
- `customers.invoiceHistory` (array-contains)
- `storeSales.customerName + timestamp`
- `onlineOrders.customerName + timestamp`

---

## 📌 Example Output

### CLI Report Sample

```
========================================
   LOYALTY & PRODUCTS SUMMARY
========================================

📊 Business Insights:
   • Total Customers: 150
   • Total Revenue: €125,450.75
   • Top 10 Revenue: €55,200.00 (44.0%)
   • Average per Customer: €836.34

🏆 #1 Best Customer:
   • Name: John Doe
   • Total Spend: €5,234.50
   • Transactions: 23
   • Invoices Tracked: 15

🎯 #1 Top Product (Top 10 Customers):
   • Product: SC 2 EasyFix *EU
   • Code: 1.512-600.0
   • Quantity Sold: 45
   • Revenue: €7,155.00

========================================
```

### Web Dashboard Screenshots

**Summary Metrics:**
```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ Total        │ Total        │ Top 10       │ Top 10       │
│ Customers    │ Revenue      │ Revenue      │ Share        │
│     150      │  €125,451    │   €55,200    │   44.0%      │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

**Top Customer Card:**
```
🥇 1  John Doe                           €5,234.50
      23 transactions • 15 invoices      Total Spend

🥈 2  ABC Company                        €3,890.00
      18 transactions • 12 invoices      Total Spend

🥉 3  XYZ Corporation                    €3,450.00
      15 transactions • 10 invoices      Total Spend
```

**Top Product Card:**
```
🥇 1  SC 2 EasyFix *EU                   €7,155.00
      1.512-600.0 • 45 sold              Revenue

🥈 2  K5 Premium                         €6,240.00
      1.324-500.0 • 32 sold              Revenue

🥉 3  Carpet & Upholstery                €4,800.00
      6.295-771.0 • 40 sold              Revenue
```

---

## 🔍 Troubleshooting

### Issue: No customers showing
**Cause:** Customers collection is empty or has no invoiceHistory
**Solution:** 
```bash
npm run audit-customers        # Check customer data
npm run migrate-customers      # Add invoiceHistory arrays
```

### Issue: Zero revenue despite customers existing
**Cause:** Customer names don't match between customers and storeSales
**Solution:** 
- Existing imported sales may use different names
- New invoices processed via OCR Bridge will match correctly
- Wait for real-time invoices to populate data

### Issue: Web dashboard not loading
**Cause:** Firebase configuration or network issue
**Solution:**
- Check browser console for errors
- Verify Firebase indexes are deployed
- Check internet connection

### Issue: Rankings seem wrong
**Cause:** Recent sales not yet reflected
**Solution:** Click **"🔄 Refresh"** button to reload data

---

## 🎓 Best Practices

1. **Regular Monitoring**
   - Check dashboard weekly to track customer trends
   - Set calendar reminder to review top customers monthly

2. **Act on Insights**
   - Contact top customers for feedback
   - Stock popular products proactively
   - Create promotions for underperforming items

3. **Data Quality**
   - Run `npm run audit-customers` monthly
   - Merge duplicates when found
   - Ensure customer names are consistent

4. **Performance**
   - Web dashboard caches data for 5 minutes
   - CLI report is instant (no caching)
   - Use CLI for real-time analysis

---

## 🚀 Future Enhancements

Potential additions:
- Customer lifetime value (CLV) trends
- Month-over-month growth charts
- Product category analysis
- Seasonal trend detection
- Automated loyalty rewards triggers
- Email alerts for customer inactivity
- Export to PDF/Excel

---

## 📞 Quick Reference

**Commands:**
```bash
npm run loyalty-dashboard      # CLI report
npm run view-customer "Name"   # Single customer 360° view
npm run audit-customers        # Database audit
```

**Web URLs:**
```
http://localhost:8080/loyalty-dashboard.html
http://localhost:8080/index.html
```

**Files:**
```
loyalty-dashboard.js              # CLI script
www/loyalty-dashboard.html        # Web UI
LOYALTY_DASHBOARD_GUIDE.md        # This guide
```

---

**System Owner:** Danfosal App - Kushtrim  
**Created:** February 8, 2026  
**Version:** 1.0.0  
**Status:** ✅ Production Ready
