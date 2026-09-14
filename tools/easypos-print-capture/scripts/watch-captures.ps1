# Watch for captured receipts in real-time
$watchPath = "C:\Danfosal\Inbox\EasyPOS"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  CAPTURE WATCHER - Monitoring Active" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Watching: $watchPath" -ForegroundColor White
Write-Host "Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`n" -ForegroundColor Gray
Write-Host "Press Ctrl+C to stop...`n" -ForegroundColor Yellow

# Check current state
$existing = Get-ChildItem $watchPath -Filter "*.png" -File -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Existing files:" -ForegroundColor Green
    $existing | ForEach-Object { Write-Host "  - $($_.Name) ($($_.Length) bytes) at $($_.LastWriteTime)" }
} else {
    Write-Host "No files yet - waiting for first capture..." -ForegroundColor Yellow
}

Write-Host "`nWaiting for new files...`n" -ForegroundColor Cyan

# Create FileSystemWatcher
$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $watchPath
$watcher.Filter = "*.*"
$watcher.IncludeSubdirectories = $true
$watcher.EnableRaisingEvents = $true

# Define actions
$action = {
    $path = $Event.SourceEventArgs.FullPath
    $changeType = $Event.SourceEventArgs.ChangeType
    $timestamp = Get-Date -Format 'HH:mm:ss'
    
    $color = "White"
    if ($path -like "*.png") { $color = "Green" }
    elseif ($path -like "*.json") { $color = "Cyan" }
    elseif ($path -like "*.emf") { $color = "Yellow" }
    elseif ($path -like "*.spl") { $color = "Magenta" }
    
    Write-Host "[$timestamp] $changeType : " -NoNewline -ForegroundColor Gray
    Write-Host "$path" -ForegroundColor $color
}

# Register events
Register-ObjectEvent $watcher "Created" -Action $action | Out-Null
Register-ObjectEvent $watcher "Changed" -Action $action | Out-Null

# Keep running
try {
    while ($true) {
        Start-Sleep -Seconds 1
    }
} finally {
    $watcher.Dispose()
    Get-EventSubscriber | Unregister-Event
}
