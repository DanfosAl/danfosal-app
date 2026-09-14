# Email Configuration Guide for Weekly Reports

## Setup Instructions

### 1. Create Email Configuration File

Copy the example file and customize it:

```powershell
cd E:\DanfosalApp\resources\app\config
Copy-Item email-config.example.json email-config.json
```

Edit `email-config.json` with your credentials.

---

## Email Provider Setup

### Option 1: Gmail (Recommended)

**Steps:**

1. Enable 2-Factor Authentication on your Google account
2. Generate an App Password:
   - Go to: https://myaccount.google.com/apppasswords
   - Select "Mail" and "Windows Computer"
   - Copy the 16-character password

**Configuration:**

```json
{
  "smtp": {
    "host": "smtp.gmail.com",
    "port": 587,
    "secure": false,
    "user": "your-email@gmail.com",
    "password": "xxxx xxxx xxxx xxxx"
  },
  "from": "Danfosal Reporting <your-email@gmail.com>",
  "recipients": [
    "kushtrim@danfosal.al"
  ],
  "attachPDF": true
}
```

---

### Option 2: Outlook/Office 365

**Configuration:**

```json
{
  "smtp": {
    "host": "smtp-mail.outlook.com",
    "port": 587,
    "secure": false,
    "user": "your-email@outlook.com",
    "password": "your-password"
  },
  "from": "Danfosal Reporting <your-email@outlook.com>",
  "recipients": [
    "kushtrim@danfosal.al"
  ],
  "attachPDF": true
}
```

---

### Option 3: Custom SMTP Server

**Configuration:**

```json
{
  "smtp": {
    "host": "mail.yourdomain.com",
    "port": 465,
    "secure": true,
    "user": "noreply@yourdomain.com",
    "password": "your-password"
  },
  "from": "Danfosal Reports <noreply@yourdomain.com>",
  "recipients": [
    "kushtrim@danfosal.al",
    "manager@danfosal.al"
  ],
  "attachPDF": false
}
```

---

## Configuration Options

### SMTP Settings

| Field | Description | Example |
|-------|-------------|---------|
| `host` | SMTP server hostname | `smtp.gmail.com` |
| `port` | SMTP port (587 for TLS, 465 for SSL) | `587` |
| `secure` | Use SSL? (true for 465, false for 587) | `false` |
| `user` | SMTP username (usually email) | `reports@danfosal.al` |
| `password` | SMTP password or app password | `xxxx xxxx xxxx xxxx` |

### Email Settings

| Field | Description | Example |
|-------|-------------|---------|
| `from` | Sender name and email | `"Danfosal <noreply@danfosal.al>"` |
| `recipients` | Array of email addresses | `["user1@example.com", "user2@example.com"]` |
| `attachPDF` | Attach PDF to email? | `true` or `false` |

**Note:** If `attachPDF` is `false`, the email will only contain the report location path.

---

## Testing Email Configuration

After setting up your `email-config.json`, test it:

```powershell
cd E:\DanfosalApp\resources\app
node weekly-report-scheduler.js --test
```

Check the output for:
- ✅ Email configuration loaded
- ✅ Email sent successfully

---

## Troubleshooting

### Error: "Invalid login"

**Cause:** Wrong username/password or app password not enabled.

**Solution:**
1. Verify email and password are correct
2. For Gmail: Enable 2FA and generate App Password
3. For Outlook: Check if account allows SMTP access

### Error: "Connection timeout"

**Cause:** Firewall blocking SMTP port.

**Solution:**
1. Check firewall allows outbound connections on port 587/465
2. Verify SMTP host is correct
3. Try different port (587 vs 465)

### Error: "Self-signed certificate"

**Cause:** SMTP server uses self-signed SSL certificate.

**Solution:**

Add to configuration:

```json
{
  "smtp": {
    ...
    "tls": {
      "rejectUnauthorized": false
    }
  }
}
```

### Email not received

**Possible causes:**

1. **Spam folder**: Check recipient's spam/junk folder
2. **Attachment too large**: Try `"attachPDF": false`
3. **Recipient limit**: Some SMTP servers limit recipients per message
4. **Rate limiting**: SMTP server may block rapid emails

---

## Disable Email Notifications

**Option 1:** Delete or rename the config file:

```powershell
Rename-Item email-config.json email-config.json.disabled
```

**Option 2:** Set `recipients` to empty array:

```json
{
  ...
  "recipients": []
}
```

The scheduler will still generate PDFs but skip email sending.

---

## Security Best Practices

1. ✅ **Never commit** `email-config.json` to Git
2. ✅ Use **App Passwords** instead of account passwords
3. ✅ Restrict file permissions:
   ```powershell
   icacls email-config.json /inheritance:r /grant:r "$env:USERNAME:(F)"
   ```
4. ✅ Use dedicated email account for automation
5. ✅ Monitor SMTP credentials for unauthorized access

---

## Example: Complete Working Configuration

```json
{
  "smtp": {
    "host": "smtp.gmail.com",
    "port": 587,
    "secure": false,
    "user": "danfosal.reports@gmail.com",
    "password": "abcd efgh ijkl mnop"
  },
  "from": "Danfosal Automated Reports <danfosal.reports@gmail.com>",
  "recipients": [
    "kushtrim@danfosal.al",
    "admin@danfosal.al"
  ],
  "attachPDF": true
}
```

**What happens every Monday at 08:00 AM:**

1. 📊 Executive Report PDF is generated
2. 💾 Saved to: `C:\Danfosal\Reports\Weekly\Danfosal_Report_2026_W07.pdf`
3. 📧 Email sent to all recipients with:
   - Professional HTML email
   - Report details (filename, size, generation time)
   - PDF attachment (if `attachPDF: true`)
   - Report highlights (growth, products, predictions)

---

## Support

If you encounter issues with email setup:

1. Check logs: `E:\DanfosalApp\resources\app\logs\weekly-scheduler.log`
2. Test with `--test` flag to debug
3. Verify SMTP credentials with email provider
4. Try without PDF attachment first

For Gmail troubleshooting: https://support.google.com/accounts/answer/185833
