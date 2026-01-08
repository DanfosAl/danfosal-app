# Add theme-manager.js to all HTML files
$files = @(
    "creditors_list.html",
    "creditor_detail.html",
    "debtor_detail_page.html",
    "debts.html",
    "invoices_list.html",
    "to_order.html",
    "advanced-analytics.html"
)

foreach ($file in $files) {
    $path = "e:\danfosal-app\www\$file"
    if (Test-Path $path) {
        $content = Get-Content $path -Raw
        
        # Check if theme-manager.js is already added
        if ($content -notmatch 'theme-manager\.js') {
            # Add after tailwindcss script
            $content = $content -replace '(<script src="https://cdn\.tailwindcss\.com"></script>)', '$1`n    <script src="theme-manager.js"></script>'
            Set-Content $path $content -NoNewline
            Write-Host "Updated: $file" -ForegroundColor Green
        } else {
            Write-Host "Already updated: $file" -ForegroundColor Yellow
        }
    }
}

Write-Host "`nDone!" -ForegroundColor Cyan
