# Executive Reporting System - User Guide

## Overview

The **Executive Reporting & PDF Export System** provides comprehensive business intelligence for Danfosal, including:

- 📊 **Growth Trend Analysis** - Compare current vs previous period performance
- 🚀 **Product Velocity Tracking** - Identify winners and losers
- ⏰ **Temporal Analysis** - Sales patterns by day and hour
- 🔮 **Sales Predictions** - 30-day revenue forecast using AI

---

## How to Generate Reports

### Method 1: From Loyalty Dashboard (Recommended)

1. Open the Danfosal app
2. Navigate to **Loyalty Dashboard**
3. Click **"📄 Genero Raportin Ekzekutiv"** button
4. Wait for generation (10-30 seconds)
5. PDF will open automatically in your default viewer

### Method 2: Command Line

```powershell
cd E:\DanfosalApp\resources\app
npm run export-report
```

PDF will be saved to: `E:\DanfosalApp\resources\app\exports\`

### Method 3: JSON Export (For Developers)

```powershell
npm run export-report-json
```

Exports raw analytics data as JSON for custom integrations.

---

## Understanding the Report

### Page 1: Executive Summary

#### KPI Cards

| Metric | Description | How to Use |
|--------|-------------|-----------|
| **Total Revenue** | All-time revenue from all transactions | View overall business performance |
| **Total Transactions** | Number of completed orders | Measure sales activity |
| **Average Order Value** | Revenue ÷ Transactions | Track customer spending habits |
| **30-Day Forecast** | Predicted revenue for next month | Plan inventory and cash flow |

#### Revenue Trend Chart

- **Last 60 Days**: Daily revenue visualization
- **Trend Line**: Shows if business is growing or declining
- **Use Case**: Identify seasonal patterns, track marketing campaign impact

#### Growth Comparison

Compares **Last 30 Days** vs **Previous 30 Days** for:

- Revenue Growth %
- Transaction Growth %
- Average Order Value Growth %

**Interpretation:**

- 🟢 **Green** = Positive growth (good!)
- 🔴 **Red** = Negative growth (needs attention)

---

### Page 2: Product Performance

#### Winners Table (Top 5 Growing Products)

Shows products with **highest revenue growth** compared to previous period.

**Action Items:**

- 🥇 **Rank 1-3**: Ensure adequate stock, these are hot sellers
- Promote winners with bundle deals
- Analyze what makes them successful

#### Losers Table (Top 5 Declining Products)

Products with **largest revenue decline**.

**Action Items:**

- 📉 **Investigate reasons**: Seasonality? Competition? Quality issues?
- Consider promotions or discounts
- Evaluate if discontinuation is needed

#### Product Growth Chart

Visual comparison between winners and losers.

- **Longer bars** = Stronger growth or decline
- Use to prioritize merchandising efforts

---

### Page 3: Temporal Analysis & Predictions

#### Day of Week Chart

Shows which days generate most revenue.

**Business Applications:**

- **High Revenue Days**: Schedule more staff, run promotions
- **Low Revenue Days**: Offer discounts to boost traffic, reduce staffing

**Example:** If Monday is peak day, focus marketing campaigns on Sunday evening.

#### Hour of Day Chart

24-hour sales pattern analysis.

**Use Cases:**

- Optimize store hours
- Schedule deliveries during slow periods
- Plan social media posts for high-traffic hours

**Example:** If 10 AM - 2 PM are peak hours, ensure full staffing and inventory.

#### 30-Day Sales Prediction

**Machine Learning Forecast** using linear regression on 6 months of historical data.

**How It Works:**

1. Analyzes last 180 days of sales
2. Calculates trend line (slope + intercept)
3. Projects next 30 days of revenue

**Interpretation:**

- **Upward Trend**: Business is growing, plan for increased demand
- **Flat Trend**: Stable business, maintain current operations
- **Downward Trend**: Action needed - marketing, new products, cost reduction

**⚠️ Accuracy Note:** Predictions assume historical patterns continue. External factors (new competitors, economic changes) may affect accuracy.

---

## Analytics Engine Details

### Data Sources

- **Store Sales**: Imported from EasyPOS via OCR Bridge
- **Online Orders**: Web and mobile app orders
- **Time Range**: Last 6 months for predictions, 30 days for growth analysis

### Calculations

#### Growth Formula

```
Growth % = ((Current Period - Previous Period) / Previous Period) × 100
```

#### Product Velocity

```
Product Growth = (Current Revenue - Previous Revenue) / Previous Revenue × 100
```

Ranked by absolute growth percentage.

#### Linear Regression (Predictions)

```
y = slope × day + intercept

Where:
  slope = (n∑xy - ∑x∑y) / (n∑x² - (∑x)²)
  intercept = (∑y - slope∑x) / n
```

This algorithm finds the best-fit line through historical data points.

---

## Technical Specifications

### PDF Details

- **Format**: A4 (210mm × 297mm)
- **Pages**: 3
- **Resolution**: High (300 DPI equivalent)
- **File Size**: ~1-2 MB
- **Charts**: 6 Chart.js visualizations

### Report Components

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Analytics Engine | Node.js | Calculate metrics, predictions |
| Visual Template | HTML + Chart.js 4.4.0 | Professional design |
| PDF Generator | Puppeteer + Chrome | High-quality rendering |
| Integration | Electron IPC | Desktop app integration |

### System Requirements

- Node.js 18+
- Puppeteer (headless Chrome)
- Firebase Admin SDK
- Minimum 4 GB RAM (for Chromium)

---

## Troubleshooting

### Issue: "PDF generation failed"

**Solutions:**

1. Check internet connection (Firebase access required)
2. Ensure Puppeteer is installed: `npm install puppeteer`
3. Verify service account key exists: `serviceAccountKey.json`
4. Check disk space (PDF generation needs ~500 MB temp space)

### Issue: "No data available"

**Cause:** Insufficient transaction history in Firebase.

**Solutions:**

1. Run OCR Bridge to import EasyPOS sales
2. Wait for online orders to accumulate
3. Check Firebase connection: `node inspect-data.js`

### Issue: Charts not rendering

**Cause:** Network timeout or Chart.js CDN failure.

**Solutions:**

1. Check internet connection
2. Increase wait time in `export-pdf.js` (line 68): Change `2000` to `5000`
3. Verify HTML template loads CDN: Chart.js 4.4.0

### Issue: Predictions seem inaccurate

**Cause:** Insufficient historical data or unusual patterns.

**Explanation:**

- Linear regression requires at least 2-3 months of data
- Algorithm assumes trends continue
- External factors (holidays, promotions) can skew predictions

**Recommendation:** Use predictions as **guidance**, not absolute truth. Combine with business intuition.

---

## Business Use Cases

### 1. Monthly Board Meeting

**Workflow:**

1. Generate PDF before meeting
2. Present **Page 1** (Executive Summary) to stakeholders
3. Highlight growth % and forecast
4. Use as basis for budget discussions

### 2. Product Management

**Workflow:**

1. Review **Page 2** (Product Performance) weekly
2. Identify **Winners** → Ensure stock, promote
3. Identify **Losers** → Investigate, discount, or discontinue
4. Track product lifecycle

### 3. Operational Planning

**Workflow:**

1. Analyze **Page 3** (Temporal Analysis) monthly
2. Adjust staffing based on **Day of Week** chart
3. Optimize store hours using **Hour of Day** chart
4. Schedule deliveries during low-traffic periods

### 4. Sales Forecasting

**Workflow:**

1. Use **30-Day Prediction** for procurement planning
2. Compare predicted vs actual next month
3. Refine inventory based on forecast
4. Adjust marketing budget to predicted revenue

### 5. Investor Relations

**Workflow:**

1. Generate quarterly reports
2. Show **Growth Comparison** to demonstrate traction
3. Present **Revenue Trend** to highlight momentum
4. Use **Predictions** to set growth targets

---

## Advanced Features

### Custom Date Ranges (Future Enhancement)

Currently, the system uses fixed periods:

- Growth Trends: Last 30 days vs Previous 30 days
- Predictions: 6 months history → 30 days forward

**To customize**, edit [analytics-engine.js](E:/DanfosalApp/resources/app/analytics-engine.js):

```javascript
// Line ~350
const growthTrends = this.calculateGrowthTrends(60); // 60 days instead of 30
const predictions = await this.predictSales(12, 90); // 12 months → 90 days
```

### API Integration (Web/Mobile Apps)

Expose analytics via Express.js API:

```javascript
// example: api-server.js
const PDFExportService = require('./export-pdf');
const express = require('express');
const app = express();

app.post('/api/generate-report', async (req, res) => {
  const service = new PDFExportService();
  const result = await service.generatePDF();
  res.json({ downloadUrl: `/reports/${result.filename}` });
});

app.listen(3000);
```

### Scheduled Reports (Automation)

Use Windows Task Scheduler to generate weekly reports:

```powershell
# Create scheduled task
$action = New-ScheduledTaskAction -Execute "npm" -Argument "run export-report" -WorkingDirectory "E:\DanfosalApp\resources\app"
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 9am
Register-ScheduledTask -TaskName "Danfosal Weekly Report" -Action $action -Trigger $trigger
```

---

## Best Practices

### Frequency

- **Daily**: Not recommended (data changes slowly)
- **Weekly**: Good for operational planning
- **Monthly**: Ideal for executive reviews
- **Quarterly**: For board meetings and investor updates

### Data Quality

**Ensure accurate reporting by:**

1. Running OCR Bridge daily to import EasyPOS sales
2. Verifying customer name consistency
3. Checking for duplicate transactions
4. Using `npm run audit-customers` regularly

### Interpretation

**Do:**

- ✅ Compare trends across multiple periods
- ✅ Combine data with qualitative insights
- ✅ Use predictions as **guidance**
- ✅ Cross-reference with financial statements

**Don't:**

- ❌ Rely solely on predictions for major decisions
- ❌ Ignore external factors (economy, competition)
- ❌ Compare incomplete periods (e.g., partial month)
- ❌ Over-interpret small percentage changes

### Security

- 🔒 PDFs contain sensitive business data
- 🔒 Store in secure location
- 🔒 Use encryption for email distribution
- 🔒 Restrict Firebase access (service account keys)

---

## Support

### Contact

For technical issues or feature requests, contact the development team.

### Files

- **Analytics Engine**: [analytics-engine.js](E:/DanfosalApp/resources/app/analytics-engine.js)
- **PDF Service**: [export-pdf.js](E:/DanfosalApp/resources/app/export-pdf.js)
- **Report Template**: [www/executive-report.html](E:/DanfosalApp/resources/app/www/executive-report.html)
- **Dashboard Integration**: [www/loyalty-dashboard.html](E:/DanfosalApp/resources/app/www/loyalty-dashboard.html)

### Logs

Check console output for detailed debugging:

```powershell
npm run export-report
# Logs show: data loading, analytics calculations, PDF generation steps
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| **1.0.0** | 2026-02-08 | Initial release with growth trends, product velocity, temporal analysis, predictions |

---

## License

Copyright © 2026 Danfosal Sh.P.K. All rights reserved.

---

**📄 End of User Guide**

For the latest updates, see: [CHANGELOG.md](../docs/CHANGELOG.md)
