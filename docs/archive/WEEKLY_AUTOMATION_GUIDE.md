# Weekly Report Automation Service

## Overview

The **Weekly Report Automation Service** automatically generates Executive PDF Reports every **Monday at 08:00 AM** without any manual intervention. Reports are saved with standardized filenames and can optionally be emailed to stakeholders.

---

## Features

✅ **Automated Scheduling** - Runs every Monday at 08:00 AM  
✅ **Standardized Naming** - `Danfosal_Report_2026_W06.pdf` (ISO week number)  
✅ **Dedicated Storage** - `C:\Danfosal\Reports\Weekly\`  
✅ **Email Notifications** - Optional email with PDF attachment  
✅ **Comprehensive Logging** - Activity logs for troubleshooting  
✅ **Silent Operation** - Runs in background without user interaction  
✅ **Startup Integration** - Automatically starts with system  

---

## Installation

### 1. Dependencies Already Installed

The following packages were installed:

```powershell
npm install node-cron nodemailer
```

✅ `node-cron` - Task scheduler  
✅ `nodemailer` - Email notifications  

### 2. Files Created

| File | Purpose |
|------|---------|
| [weekly-report-scheduler.js](E:/DanfosalApp/resources/app/weekly-report-scheduler.js) | Main scheduler script |
| [start-scheduler-hidden.vbs](E:/DanfosalApp/resources/app/start-scheduler-hidden.vbs) | Silent launcher |
| [config/email-config.example.json](E:/DanfosalApp/resources/app/config/email-config.example.json) | Email template |
| [config/EMAIL_SETUP_GUIDE.md](E:/DanfosalApp/resources/app/config/EMAIL_SETUP_GUIDE.md) | Email configuration guide |

### 3. Startup Script Updated

[DanfosalStartup.bat](E:/DanfosalApp/DanfosalStartup.bat) now includes:

```batch
[4/4] Starting Weekly Report Scheduler...
```

The scheduler starts automatically when the system boots.

---

## How It Works

### Scheduling Logic

**Cron Expression:** `0 8 * * 1`

| Minute | Hour | Day | Month | Weekday |
|--------|------|-----|-------|---------|
| 0 | 8 | * | * | 1 (Monday) |

**Translation:** Every Monday at 08:00 AM (Albania timezone: Europe/Tirane)

### Workflow

1. **08:00 AM Monday** - Cron job triggers
2. **Analytics Generation** - Loads data from Firebase, calculates metrics
3. **PDF Creation** - Renders executive-report.html with Puppeteer
4. **File Saving** - Saves to `C:\Danfosal\Reports\Weekly\Danfosal_Report_YYYY_WWW.pdf`
5. **Email Notification** - If configured, sends email with PDF attachment
6. **Logging** - Records activity to `logs/weekly-scheduler.log`

### Filename Convention

Format: `Danfosal_Report_YYYY_WWW.pdf`

**Examples:**
- `Danfosal_Report_2026_W06.pdf` - Week 6 of 2026 (February 10-16)
- `Danfosal_Report_2026_W07.pdf` - Week 7 of 2026 (February 17-23)
- `Danfosal_Report_2026_W52.pdf` - Week 52 of 2026 (December 21-27)

**ISO Week Standard:** Week 1 is the first week with Thursday in the new year.

---

## Usage

### Automatic (Recommended)

The scheduler starts automatically via [DanfosalStartup.bat](E:/DanfosalApp/DanfosalStartup.bat):

1. System boots
2. Startup script runs
3. Scheduler starts silently in background
4. Every Monday at 08:00 AM, report generates automatically

**Check if running:**

```powershell
tasklist | findstr node.exe
```

You should see multiple `node.exe` processes (OCR Bridge + Scheduler).

### Manual Start

**Scheduler Mode** (runs continuously):

```powershell
cd E:\DanfosalApp\resources\app
npm run weekly-scheduler
```

**Test Mode** (generate report immediately):

```powershell
cd E:\DanfosalApp\resources\app
node weekly-report-scheduler.js --test
```

**Background Mode** (silent):

```powershell
cscript //nologo start-scheduler-hidden.vbs
```

### Manual Stop

```powershell
# Find node.exe process IDs
tasklist | findstr node.exe

# Kill specific process (replace PID)
taskkill /PID [process_id] /F
```

---

## Email Configuration (Optional)

Email notifications are **optional** but highly recommended for team collaboration.

### Setup Steps

1. **Copy example config:**

   ```powershell
   cd E:\DanfosalApp\resources\app\config
   Copy-Item email-config.example.json email-config.json
   ```

2. **Edit `email-config.json`:**

   ```json
   {
     "smtp": {
       "host": "smtp.gmail.com",
       "port": 587,
       "secure": false,
       "user": "your-email@gmail.com",
       "password": "your-app-password"
     },
     "from": "Danfosal Reports <noreply@danfosal.al>",
     "recipients": [
       "kushtrim@danfosal.al"
     ],
     "attachPDF": true
   }
   ```

3. **Test email:**

   ```powershell
   node weekly-report-scheduler.js --test
   ```

   Check for: `✅ Email sent successfully`

### Email Providers

| Provider | SMTP Host | Port | Guide |
|----------|-----------|------|-------|
| **Gmail** | smtp.gmail.com | 587 | [Setup App Password](https://myaccount.google.com/apppasswords) |
| **Outlook** | smtp-mail.outlook.com | 587 | Use account password |
| **Custom** | mail.yourdomain.com | 465/587 | Contact hosting provider |

**See:** [EMAIL_SETUP_GUIDE.md](E:/DanfosalApp/resources/app/config/EMAIL_SETUP_GUIDE.md) for detailed instructions.

### Email Content

When enabled, emails include:

- 📊 Professional HTML formatting
- 📄 Report filename and location
- 📅 Generation timestamp
- 💾 File size
- 📈 Report highlights (growth, products, predictions)
- 📎 PDF attachment (optional)

**Example Subject:** `📊 Weekly Executive Report - Danfosal_Report_2026_W06`

---

## Output Location

### Local Storage

**Path:** `C:\Danfosal\Reports\Weekly\`

**Structure:**

```
C:\Danfosal\
└── Reports\
    └── Weekly\
        ├── Danfosal_Report_2026_W01.pdf
        ├── Danfosal_Report_2026_W02.pdf
        ├── Danfosal_Report_2026_W03.pdf
        ...
        └── Danfosal_Report_2026_W52.pdf
```

**Benefits:**

- ✅ Organized by week number
- ✅ Easy to find specific reports
- ✅ Historical archive for trend analysis
- ✅ Backup-friendly location

**Disk Space:** ~1.3 MB per report → ~67 MB per year (52 weeks)

### Cloud Backup (Recommended)

**Option 1: Manual Backup**

Copy weekly folder to cloud storage:

```powershell
# OneDrive
robocopy "C:\Danfosal\Reports\Weekly" "C:\Users\%USERNAME%\OneDrive\Danfosal Reports" /MIR

# Google Drive
robocopy "C:\Danfosal\Reports\Weekly" "G:\My Drive\Danfosal Reports" /MIR
```

**Option 2: Automated Sync**

Use OneDrive, Google Drive, or Dropbox Desktop apps to sync `C:\Danfosal\Reports\` folder.

---

## Logging

### Log Files

**Location:** `E:\DanfosalApp\resources\app\logs\weekly-scheduler.log`

**Content:**

```
[2026-02-08T08:00:00.123Z] ⏰ Scheduled task triggered (Monday 08:00 AM)
[2026-02-08T08:00:00.456Z] 📄 Generating report: Danfosal_Report_2026_W06.pdf
[2026-02-08T08:00:07.789Z] ✅ Report generated successfully!
[2026-02-08T08:00:07.790Z] 📂 Location: C:\Danfosal\Reports\Weekly\Danfosal_Report_2026_W06.pdf
[2026-02-08T08:00:08.123Z] ✅ Email sent successfully: <message-id@smtp.gmail.com>
```

### Viewing Logs

**PowerShell:**

```powershell
Get-Content E:\DanfosalApp\resources\app\logs\weekly-scheduler.log -Tail 50
```

**Notepad:**

```powershell
notepad E:\DanfosalApp\resources\app\logs\weekly-scheduler.log
```

**Real-time monitoring:**

```powershell
Get-Content E:\DanfosalApp\resources\app\logs\weekly-scheduler.log -Wait
```

---

## Troubleshooting

### Issue: Reports not generating on Monday

**Check 1: Is scheduler running?**

```powershell
tasklist | findstr node.exe
```

If not, restart scheduler:

```powershell
cd E:\DanfosalApp\resources\app
npm run weekly-scheduler
```

**Check 2: System time correct?**

```powershell
Get-Date
# Should show: Monday 08:00 AM (Albania time)
```

**Check 3: Check logs**

```powershell
Get-Content logs\weekly-scheduler.log -Tail 20
```

Look for errors.

---

### Issue: PDF generated but email not sent

**Check 1: Email config exists?**

```powershell
Test-Path config\email-config.json
```

If `False`, email is disabled (optional).

**Check 2: Test email configuration**

```powershell
node weekly-report-scheduler.js --test
```

Look for: `✅ Email sent successfully`

**Check 3: SMTP credentials correct?**

- Gmail: Must use [App Password](https://myaccount.google.com/apppasswords), not account password
- Outlook: Check account allows SMTP access
- Custom: Verify host, port, username, password

**Check 4: Check spam folder**

Automated emails may be filtered. Add sender to safe list.

---

### Issue: "MODULE_NOT_FOUND" error

**Cause:** Missing dependencies.

**Fix:**

```powershell
cd E:\DanfosalApp\resources\app
npm install
```

---

### Issue: Scheduler starts but crashes immediately

**Check analytics engine:**

```powershell
node analytics-engine.js
```

If this fails, check:

1. Firebase service account key exists: `serviceAccountKey.json`
2. Internet connection (Firebase access required)
3. Firestore has data (storeSales, onlineOrders collections)

---

### Issue: PDF blank or missing charts

**Cause:** Puppeteer rendering timeout.

**Fix:** Increase wait time in [export-pdf.js](E:/DanfosalApp/resources/app/export-pdf.js):

```javascript
// Line ~68
await new Promise(resolve => setTimeout(resolve, 5000)); // Increase from 2000 to 5000
```

---

## Testing

### Test 1: Generate Report Immediately

```powershell
cd E:\DanfosalApp\resources\app
node weekly-report-scheduler.js --test
```

**Expected output:**

```
🧪 TEST MODE: Generating report manually...
📄 Generating report: Danfosal_Report_2026_W06.pdf
✅ Report generated successfully!
📂 Location: C:\Danfosal\Reports\Weekly\Danfosal_Report_2026_W06.pdf
✅ Test completed successfully!
```

**Verify:**

1. PDF exists at `C:\Danfosal\Reports\Weekly\`
2. PDF opens correctly (3 pages)
3. Charts render properly
4. Data is accurate

---

### Test 2: Email Notification (If Configured)

```powershell
node weekly-report-scheduler.js --test
```

**Expected output:**

```
✅ Email configuration loaded
📧 Sending email notification...
✅ Email sent successfully: <message-id>
   Recipients: kushtrim@danfosal.al
```

**Verify:**

1. Email received by all recipients
2. Subject line correct
3. HTML formatting looks professional
4. PDF attachment included (if `attachPDF: true`)
5. All links work

---

### Test 3: Scheduler Cron Job

**Manually trigger cron job:**

```powershell
# Start scheduler
npm run weekly-scheduler

# In another terminal, check logs
Get-Content logs\weekly-scheduler.log -Wait
```

**Wait for next Monday 08:00 AM**, or temporarily modify the cron expression for testing:

Edit [weekly-report-scheduler.js](E:/DanfosalApp/resources/app/weekly-report-scheduler.js):

```javascript
// Line ~184 - Change to run every minute for testing
const cronExpression = '* * * * *'; // Every minute
// Original: '0 8 * * 1' // Every Monday at 08:00 AM
```

**Verify:**

1. Report generates automatically
2. Log shows: `⏰ Scheduled task triggered`
3. Email sent (if configured)

**Remember to revert cron expression after testing!**

---

### Test 4: Startup Integration

**Reboot system** or manually run:

```powershell
E:\DanfosalApp\DanfosalStartup.bat
```

**Expected output:**

```
[4/4] Starting Weekly Report Scheduler...
      Starting Weekly Report Scheduler (hidden mode)...
      SUCCESS: Scheduler started (running silently)
      Reports will be generated every Monday at 08:00 AM
```

**Verify:**

```powershell
tasklist | findstr node.exe
```

Should show multiple `node.exe` processes.

---

## Advanced Configuration

### Change Schedule

Edit [weekly-report-scheduler.js](E:/DanfosalApp/resources/app/weekly-report-scheduler.js):

```javascript
// Line ~184
const cronExpression = '0 8 * * 1'; // Every Monday at 08:00 AM

// Examples:
// '0 9 * * 1'     -> Every Monday at 09:00 AM
// '0 8 * * 5'     -> Every Friday at 08:00 AM
// '0 8 1 * *'     -> 1st day of every month at 08:00 AM
// '0 8 1,15 * *'  -> 1st and 15th of month at 08:00 AM
```

**Cron Format:**

```
┌────── Minute (0-59)
│ ┌──── Hour (0-23)
│ │ ┌── Day of Month (1-31)
│ │ │ ┌ Month (1-12)
│ │ │ │ ┌ Day of Week (0-6, Sunday=0)
│ │ │ │ │
* * * * *
```

**Resources:**

- https://crontab.guru/ - Cron expression tester
- https://crontab.cronhub.io/ - Visual cron builder

---

### Change Output Folder

Edit [weekly-report-scheduler.js](E:/DanfosalApp/resources/app/weekly-report-scheduler.js):

```javascript
// Line ~16
this.outputDir = 'C:\\Danfosal\\Reports\\Weekly';

// Change to:
this.outputDir = 'D:\\Reports\\Executive';
this.outputDir = 'C:\\Users\\Kushtrim\\Documents\\Reports';
this.outputDir = '\\\\NetworkShare\\Danfosal\\Reports';
```

**Note:** Use double backslashes `\\` for Windows paths in JavaScript.

---

### Add Multiple Email Recipients

Edit [config/email-config.json](E:/DanfosalApp/resources/app/config/email-config.json):

```json
{
  "recipients": [
    "kushtrim@danfosal.al",
    "manager@danfosal.al",
    "accounting@danfosal.al",
    "investor@example.com"
  ]
}
```

All recipients will receive the same email.

---

### Disable Email Attachment

If PDF files are too large for email:

```json
{
  "attachPDF": false
}
```

Email will only contain report location path.

---

## Performance

### Resource Usage

| Metric | Value |
|--------|-------|
| **CPU** | ~5-10% during generation (5-10 seconds) |
| **RAM** | ~300 MB (Puppeteer + Chrome) |
| **Disk** | 1.3 MB per PDF |
| **Network** | ~2 MB (Firebase data + Chart.js CDN) |

**Impact:** Minimal. Scheduler is idle 99.9% of the time, only active Monday mornings.

### Generation Time

Typical workflow:

1. **Analytics Engine:** 1-2 seconds
2. **HTML Rendering:** 2-3 seconds
3. **PDF Export:** 2-3 seconds
4. **Email Sending:** 1-2 seconds

**Total:** 6-10 seconds per report

---

## Maintenance

### Weekly Tasks

✅ **None required** - System is fully automated.

### Monthly Tasks

1. **Check logs** for any errors
2. **Verify PDFs** are generating correctly
3. **Test email** delivery (if configured)

```powershell
# Check last 4 reports
Get-ChildItem C:\Danfosal\Reports\Weekly | Sort-Object -Descending | Select-Object -First 4
```

### Quarterly Tasks

1. **Backup reports** to external drive
2. **Review disk space** (52 reports ≈ 67 MB)
3. **Update dependencies**:

   ```powershell
   cd E:\DanfosalApp\resources\app
   npm update
   ```

---

## Security

### Credentials

- 🔒 **Email config** contains SMTP password
- 🔒 **Never commit** `email-config.json` to Git
- 🔒 Use **App Passwords** (Gmail) instead of account passwords
- 🔒 Restrict file permissions:

  ```powershell
  icacls config\email-config.json /inheritance:r /grant:r "$env:USERNAME:(F)"
  ```

### PDF Reports

- 🔒 Reports contain **sensitive business data**
- 🔒 Restrict access to `C:\Danfosal\Reports\` folder
- 🔒 Use **encryption** when emailing or sharing
- 🔒 Consider **password-protecting** PDFs (future enhancement)

---

## Future Enhancements

Potential improvements:

1. **Cloud Upload** - Auto-upload to Google Drive/OneDrive
2. **SMS Notifications** - Alert via SMS when report is ready
3. **Custom Schedules** - Different schedules per report type
4. **Report Variants** - Daily, weekly, monthly, quarterly
5. **Dashboard Integration** - View all reports in web UI
6. **Retention Policy** - Auto-delete reports older than X months
7. **PDF Password Protection** - Encrypt sensitive reports

---

## Support

### Log Analysis

```powershell
# View recent errors
Get-Content logs\weekly-scheduler.log | Select-String -Pattern "ERROR|Failed"

# View successful generations
Get-Content logs\weekly-scheduler.log | Select-String -Pattern "SUCCESS|completed"

# Count reports generated
(Get-Content logs\weekly-scheduler.log | Select-String "Report generated successfully").Count
```

### Files

| File | Purpose |
|------|---------|
| [weekly-report-scheduler.js](E:/DanfosalApp/resources/app/weekly-report-scheduler.js) | Main scheduler |
| [export-pdf.js](E:/DanfosalApp/resources/app/export-pdf.js) | PDF generator |
| [analytics-engine.js](E:/DanfosalApp/resources/app/analytics-engine.js) | Analytics |
| [DanfosalStartup.bat](E:/DanfosalApp/DanfosalStartup.bat) | Startup script |

### npm Scripts

| Script | Command |
|--------|---------|
| **Run Scheduler** | `npm run weekly-scheduler` |
| **Test Report** | `node weekly-report-scheduler.js --test` |
| **Manual PDF** | `npm run export-report` |
| **View Logs** | `Get-Content logs\weekly-scheduler.log` |

---

## Summary

The Weekly Report Automation Service is now **fully operational**:

✅ Runs every Monday at 08:00 AM automatically  
✅ Generates professional PDF reports with analytics  
✅ Saves to `C:\Danfosal\Reports\Weekly\`  
✅ Optionally sends email notifications  
✅ Integrated with system startup  
✅ Comprehensive logging and error handling  

**Next Monday** (and every Monday thereafter), Kushtrim will have a fresh Executive Report waiting without lifting a finger! 🎉

---

**Version:** 1.0.0  
**Last Updated:** February 8, 2026  
**Author:** Danfosal Development Team  

