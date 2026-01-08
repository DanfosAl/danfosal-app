#!/usr/bin/env pwsh
# Smart Deployment Script
# Automatically chooses the right deployment method based on changes

param(
    [string]$UpdateType = "auto",  # auto, web, app, full
    [string]$Message = "",
    [switch]$Force = $false
)

Write-Host "🚀 Smart Deployment System" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

# Get current version
$packageJson = Get-Content "package.json" | ConvertFrom-Json
$currentVersion = $packageJson.version

Write-Host "📦 Current Version: $currentVersion" -ForegroundColor Yellow

# Analyze changes to determine deployment type
function Get-DeploymentStrategy {
    $webOnlyChanges = @(
        "*.html", "*.css", "*.js", "*.json",
        "public/*", "www/*", "*.md"
    )
    
    $appChanges = @(
        "main.js", "preload.js", "package.json", 
        "capacitor.config.ts", "android/*", "*.ps1"
    )
    
    # Check git status for changed files
    $changedFiles = git diff --name-only HEAD~1 2>$null
    
    if (-not $changedFiles) {
        $changedFiles = git diff --name-only --cached 2>$null
    }
    
    if (-not $changedFiles) {
        Write-Host "ℹ️  No git changes detected, analyzing recent files..." -ForegroundColor Blue
        # Fallback: check recently modified files
        $recentFiles = Get-ChildItem -Recurse -File | 
            Where-Object { $_.LastWriteTime -gt (Get-Date).AddHours(-1) } |
            Select-Object -ExpandProperty Name
        $changedFiles = $recentFiles -join "`n"
    }
    
    Write-Host "📝 Changed files:" -ForegroundColor Blue
    $changedFiles -split "`n" | ForEach-Object { Write-Host "   $_" -ForegroundColor Gray }
    
    $hasWebChanges = $false
    $hasAppChanges = $false
    
    foreach ($file in ($changedFiles -split "`n")) {
        foreach ($pattern in $webOnlyChanges) {
            if ($file -like $pattern) {
                $hasWebChanges = $true
                break
            }
        }
        
        foreach ($pattern in $appChanges) {
            if ($file -like $pattern) {
                $hasAppChanges = $true
                break
            }
        }
    }
    
    # Decision logic
    if ($hasAppChanges -and $hasWebChanges) {
        return "full"
    } elseif ($hasAppChanges) {
        return "app"
    } elseif ($hasWebChanges) {
        return "web"
    } else {
        return "web"  # Default to web deployment
    }
}

# Update version in app-version.json
function Update-VersionInfo {
    param($deploymentType, $message)
    
    $versionInfo = @{
        version = $currentVersion
        buildNumber = [int]($currentVersion -replace '\.' -replace '\D', '')
        releaseDate = (Get-Date).ToString("yyyy-MM-dd")
        releaseNotes = $message
        updateType = $deploymentType
        requiresAppUpdate = $deploymentType -eq "app" -or $deploymentType -eq "full"
        downloadUrl = "https://danfosal-app.web.app"
        features = @()
    }
    
    # Add cache-busting version to CSS
    $indexPath = "index.html"
    if (Test-Path $indexPath) {
        $content = Get-Content $indexPath -Raw
        $content = $content -replace 'glassmorphism\.css\?v=[^"]*', "glassmorphism.css?v=$currentVersion"
        Set-Content $indexPath -Value $content
        Write-Host "✅ Updated CSS cache-busting version" -ForegroundColor Green
    }
    
    $versionInfo | ConvertTo-Json -Depth 3 | Set-Content "public/app-version.json"
    Write-Host "✅ Updated version info" -ForegroundColor Green
}

# Determine deployment strategy
if ($UpdateType -eq "auto") {
    $strategy = Get-DeploymentStrategy
    Write-Host "🤖 Auto-detected deployment type: $strategy" -ForegroundColor Magenta
} else {
    $strategy = $UpdateType.ToLower()
    Write-Host "👤 Manual deployment type: $strategy" -ForegroundColor Magenta
}

# Get deployment message
if (-not $Message) {
    switch ($strategy) {
        "web" { $Message = "UI updates and web improvements" }
        "app" { $Message = "Native app features and optimizations" }
        "full" { $Message = "Complete app update with new features" }
        default { $Message = "General improvements and fixes" }
    }
}

Write-Host "📝 Deployment message: $Message" -ForegroundColor Yellow

# Update version information
Update-VersionInfo -deploymentType $strategy -message $Message

# Execute deployment based on strategy
Write-Host "`n🎯 Executing deployment strategy: $strategy" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green

switch ($strategy) {
    "web" {
        Write-Host "🌐 Web-only deployment (fastest)" -ForegroundColor Cyan
        Write-Host "⚡ Deploying to Firebase Hosting..." -ForegroundColor Blue
        
        npx firebase deploy --only hosting
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Web deployment successful!" -ForegroundColor Green
            Write-Host "🌍 Live at: https://danfosal-app.web.app" -ForegroundColor Blue
            Write-Host "⏱️  Users will see updates in ~30 seconds" -ForegroundColor Yellow
        } else {
            Write-Host "❌ Web deployment failed!" -ForegroundColor Red
            exit 1
        }
    }
    
    "app" {
        Write-Host "📱 App-only deployment" -ForegroundColor Cyan
        Write-Host "🔨 Building Android app..." -ForegroundColor Blue
        
        .\build-android.ps1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ App build successful!" -ForegroundColor Green
            Write-Host "📁 APK available in: android/app/build/outputs/apk/" -ForegroundColor Blue
        } else {
            Write-Host "❌ App build failed!" -ForegroundColor Red
            exit 1
        }
    }
    
    "full" {
        Write-Host "🚀 Full deployment (web + apps)" -ForegroundColor Cyan
        
        # Deploy web first (faster)
        Write-Host "1️⃣ Deploying web updates..." -ForegroundColor Blue
        npx firebase deploy --only hosting
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Web deployment successful!" -ForegroundColor Green
        } else {
            Write-Host "❌ Web deployment failed!" -ForegroundColor Red
            exit 1
        }
        
        # Then build apps
        Write-Host "2️⃣ Building apps..." -ForegroundColor Blue
        .\deploy-both-apps.ps1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Full deployment successful!" -ForegroundColor Green
        } else {
            Write-Host "❌ App deployment failed!" -ForegroundColor Red
            exit 1
        }
    }
    
    default {
        Write-Host "❌ Unknown deployment strategy: $strategy" -ForegroundColor Red
        Write-Host "Valid options: web, app, full, auto" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host "`n🎉 Deployment Complete!" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
Write-Host "📊 Summary:" -ForegroundColor Cyan
Write-Host "   Version: $currentVersion" -ForegroundColor White
Write-Host "   Type: $strategy deployment" -ForegroundColor White
Write-Host "   Message: $Message" -ForegroundColor White

if ($strategy -eq "web" -or $strategy -eq "full") {
    Write-Host "   🌐 Web: https://danfosal-app.web.app" -ForegroundColor Blue
}

if ($strategy -eq "app" -or $strategy -eq "full") {
    Write-Host "   📱 APK: android/app/build/outputs/apk/" -ForegroundColor Blue
}

Write-Host "Tip: Users will automatically get notifications about this update!" -ForegroundColor Yellow