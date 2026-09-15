# Moved to scripts\maintenance\ on 2026-09-14. Every path below is relative to resources\app,
# so pin the working directory there no matter where this is launched from.
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..\..'))

$DATE = Get-Date -Format "yyyy-MM-dd"
echo "Starting backup for $DATE..."
firebase firestore:export gs://danfosal-app.appspot.com/backups/$DATE --project danfosal-app
