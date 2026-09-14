# 🔥 Firebase Service Account Setup for EasyPOS OCR Bridge

## Overview
The OCR Bridge now automatically saves extracted invoice data to your Danfosal Firebase database using the Firebase Admin SDK.

## What Gets Saved

### 1. **Customers Collection**
- Extracted from "DETAJET E BLERESIT" section
- Fields: name, NIPT, address, email, phone, status
- Deduplication: Searches by NIPT or name before creating
- Walk-in customers are NOT saved

### 2. **StoreSales Collection**
- Each EasyPOS invoice becomes a sale record
- Fields:
  - `items`: Array of products with name, quantity, price
  - `total`: Grand total from invoice
  - `clientName`: Customer name or "Walk-in Customer"
  - `timestamp`: Current date/time
  - `type`: "easypos"
  - `easypos`: Metadata (invoice number, NIPT, capture details)

## Setup Instructions

### Step 1: Generate Firebase Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **danfosal-app**
3. Click the gear icon (⚙️) → **Project Settings**
4. Navigate to the **Service Accounts** tab
5. Click **"Generate new private key"**
6. Download the JSON file

### Step 2: Save the Service Account Key

1. Rename the downloaded file to: `serviceAccountKey.json`
2. Move it to: `E:\DanfosalApp\resources\app\`
3. **IMPORTANT**: Never commit this file to git! It contains secrets.

**File location:**
```
E:\DanfosalApp\resources\app\serviceAccountKey.json
```

### Step 3: Restart the OCR Bridge

```powershell
# Stop current bridge
Stop-Process -Name "node" -Force

# Start with hidden mode
cd E:\DanfosalApp\resources\app
cscript //nologo start-bridge-hidden.vbs
```

### Step 4: Verify Database Connection

Check the log file:
```powershell
Get-Content "C:\Danfosal\Logs\easypos-ocr-bridge.log" -Tail 20
```

You should see:
```
✅ Firebase Admin SDK initialized successfully
   Project: danfosal-app
✓ Firebase connection established
```

## Testing

1. Print a test invoice from EasyPOS
2. Wait 5-10 seconds for processing
3. Check Firestore:
   - Go to Firebase Console → Firestore Database
   - Look in `storeSales` collection for new record with `type: "easypos"`
   - Look in `customers` collection for new customer (if not Walk-in)

## Troubleshooting

### Error: "serviceAccountKey.json not found"
- Make sure the file is in the correct location: `E:\DanfosalApp\resources\app\`
- Check filename (no extra spaces or extensions like `.txt`)

### Error: "Permission denied"
- Ensure the service account has Firestore read/write permissions
- In Firebase Console → Firestore → Rules, verify access

### Error: "Project ID mismatch"
- Verify the service account JSON has `"project_id": "danfosal-app"`

## Data Flow

```
EasyPOS Print
     ↓
Print Capture Service (monitors print events)
     ↓
EMF → PNG Conversion (576px @ 300 DPI)
     ↓  
OCR Bridge (Tesseract.js extracts text)
     ↓
Data Extraction (customer, items, totals)
     ↓
Firebase Admin SDK
     ↓
Danfosal Firestore Database
     ↓
Available in all Danfosal app pages!
```

## Security Notes

⚠️ **IMPORTANT**: The `serviceAccountKey.json` file contains full admin access to your Firebase project.

- Keep it secure
- Never share it
- Never commit it to git
- Add it to `.gitignore` if using version control

## Need Help?

If you encounter issues:
1. Check the log: `C:\Danfosal\Logs\easypos-ocr-bridge.log`
2. Verify Firebase Console shows your collections
3. Ensure service account has proper permissions
