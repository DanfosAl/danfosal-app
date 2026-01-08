$pages = @(
    'online-orders.html',
    'notes.html', 
    'invoice-scanner.html',
    'import-sales-history.html',
    'smart-dashboard.html',
    'settings.html'
)

foreach($page in $pages) {
    $path = "E:\DanfosalApp\resources\app\www\$page"
    if(-not (Test-Path $path)) { continue }
    
    $content = Get-Content $path -Raw
    
    # Skip if already has auth
    if($content -match 'onAuthStateChanged') {
        Write-Host "⏭️ $page already has auth" -ForegroundColor Yellow
        continue
    }
    
    # Add auth import if using Firebase 11.6.1
    if($content -match 'firebasejs/11\.6\.1') {
        $content = $content -replace '(from "https://www\.gstatic\.com/firebasejs/11\.6\.1/firebase-firestore\.js";)', '$1`nimport { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";'
    }
    # Add auth import if using Firebase 10.8.0
    elseif($content -match 'firebasejs/10\.8\.0') {
        $content = $content -replace '(from ''https://www\.gstatic\.com/firebasejs/10\.8\.0/firebase-firestore\.js'';)', '$1`nimport { getAuth, signInAnonymously } from ''https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js'';'
    }
    # Add auth import if using Firebase 10.7.1
    elseif($content -match 'firebasejs/10\.7\.1') {
        $content = $content -replace '(from ''https://www\.gstatic\.com/firebasejs/10\.7\.1/firebase-firestore\.js'';)', '$1`nimport { getAuth, signInAnonymously } from ''https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js'';'
    }
    
    # Add auth initialization after db = getFirestore
    $content = $content -replace '(const db = getFirestore\(app\);)', '$1`n        const auth = getAuth(app);'
    
    # Find init/load function call and wrap in auth
    if($content -match '^\s+(init|loadData|loadNotes|loadInvoices|loadSettings|fetchData)\(\);?\s*$') {
        $funcName = $matches[1]
        $authWrapper = @"


        // Wait for authentication before initializing
        auth.onAuthStateChanged((user) => {
            if (user) {
                console.log("✅ User authenticated:", user.uid);
                $funcName();
            } else {
                console.log("🔄 Signing in anonymously...");
                signInAnonymously(auth).catch(err => console.error("Auth error:", err));
            }
        });
"@
        $content = $content -replace "(\s+)$funcName\(\);?(\s*</script>)", "`$1$authWrapper`$2"
    }
    
    Set-Content $path -Value $content -NoNewline
    Write-Host "✅ Fixed $page" -ForegroundColor Green
}

Write-Host "`n✨ Auth fix complete!" -ForegroundColor Cyan
