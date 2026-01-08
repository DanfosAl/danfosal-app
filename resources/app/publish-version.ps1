# Danfosal App - Publish to GitHub Script
# Run this after creating a new version

param(
    [Parameter(Mandatory=$true)]
    [string]$Version
)

Write-Host "================================" -ForegroundColor Cyan
Write-Host "  Publishing Version $Version  " -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Update version in package.json
Write-Host "Updating package.json version..." -ForegroundColor Yellow
$packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
$packageJson.version = $Version
$packageJson | ConvertTo-Json -Depth 100 | Set-Content "package.json"

# Commit changes
Write-Host "Committing changes..." -ForegroundColor Yellow
git add .
git commit -m "Version $Version"

# Create tag
Write-Host "Creating git tag v$Version..." -ForegroundColor Yellow
git tag "v$Version"

# Push to GitHub
Write-Host "Pushing to GitHub..." -ForegroundColor Yellow
git push
git push origin "v$Version"

# Build and publish
Write-Host ""
Write-Host "Building and publishing to GitHub releases..." -ForegroundColor Green
npm run publish

Write-Host ""
Write-Host "================================" -ForegroundColor Green
Write-Host "  Published Successfully!" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
Write-Host ""
Write-Host "View release at: https://github.com/DanfosAl/danfosal-app/releases" -ForegroundColor Cyan
Write-Host ""
Write-Host "Users will auto-update to version $Version" -ForegroundColor Green
