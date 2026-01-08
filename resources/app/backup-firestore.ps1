$DATE = Get-Date -Format "yyyy-MM-dd"
echo "Starting backup for $DATE..."
firebase firestore:export gs://danfosal-app.appspot.com/backups/$DATE --project danfosal-app
