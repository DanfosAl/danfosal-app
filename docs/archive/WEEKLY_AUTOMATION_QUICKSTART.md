# Weekly Automation Service - Quick Reference

## 🚀 Quick Start

### Check if Running

```powershell
tasklist | findstr node.exe
```

### Generate Report Now (Test)

```powershell
cd E:\DanfosalApp\resources\app
node weekly-report-scheduler.js --test
```

### View Latest Report

```powershell
explorer C:\Danfosal\Reports\Weekly
```

---

## 📅 Schedule

**Every Monday at 08:00 AM** (Albania timezone)

Reports saved as: `Danfosal_Report_YYYY_WWW.pdf`

---

## 📧 Email Setup (Optional)

1. Copy template:
   ```powershell
   cd E:\DanfosalApp\resources\app\config
   Copy-Item email-config.example.json email-config.json
   ```

2. Edit with your SMTP credentials

3. Test:
   ```powershell
   node weekly-report-scheduler.js --test
   ```

**Gmail users:** Need [App Password](https://myaccount.google.com/apppasswords)

See: [EMAIL_SETUP_GUIDE.md](EMAIL_SETUP_GUIDE.md)

---

## 📂 Report Location

**Path:** `C:\Danfosal\Reports\Weekly\`

**Filename Format:** `Danfosal_Report_YYYY_WWW.pdf`

**Example:** `Danfosal_Report_2026_W06.pdf` (Week 6 of 2026)

---

## 🔧 Troubleshooting

### Reports not generating?

```powershell
# Check logs
Get-Content E:\DanfosalApp\resources\app\logs\weekly-scheduler.log -Tail 20

# Restart scheduler
npm run weekly-scheduler
```

### Email not working?

```powershell
# Test configuration
node weekly-report-scheduler.js --test

# Check for: "✅ Email sent successfully"
```

### Need help?

View full guide: [WEEKLY_AUTOMATION_GUIDE.md](WEEKLY_AUTOMATION_GUIDE.md)

---

## 📊 What's in the Report?

1. **Executive Summary** - KPIs, revenue trends, growth comparison
2. **Product Performance** - Top 5 winners & losers
3. **Temporal Analysis** - Day/hour patterns, 30-day forecast

**Report size:** ~1.3 MB per PDF

---

## 🛠️ npm Scripts

| Command | Purpose |
|---------|---------|
| `npm run weekly-scheduler` | Start scheduler (continuous) |
| `node weekly-report-scheduler.js --test` | Generate report now |
| `npm run export-report` | Manual PDF (legacy) |

---

## ✅ System Status

**Services Running:**

1. Print Capture Service (Windows Service)
2. OCR Bridge (Node.js)
3. **Weekly Report Scheduler (Node.js)** ← New!

All services start automatically via [DanfosalStartup.bat](../../DanfosalStartup.bat)

---

## 🎯 Benefits

✅ **Zero manual work** - Reports generate automatically  
✅ **Consistent scheduling** - Every Monday, no exceptions  
✅ **Professional output** - High-quality PDFs with charts  
✅ **Email notifications** - Stakeholders get instant alerts  
✅ **Historical archive** - All reports stored systematically  
✅ **Silent operation** - Runs in background, no interruptions  

---

## 📞 Quick Commands

```powershell
# Test report generation
node weekly-report-scheduler.js --test

# View recent reports
Get-ChildItem C:\Danfosal\Reports\Weekly | Sort-Object -Descending | Select-Object -First 5

# Check scheduler logs
Get-Content logs\weekly-scheduler.log -Tail 50

# Restart scheduler
taskkill /F /IM node.exe
npm run weekly-scheduler
```

---

**Last Updated:** February 8, 2026  
**Status:** ✅ Operational  
**Next Report:** Monday, February 10, 2026 at 08:00 AM  
