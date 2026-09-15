#!/usr/bin/env pwsh
# Quick deploy shortcut - uses smart deployment
param(
    [string]$Message = ""
)

# Moved to scripts\deploy\ on 2026-09-14. Every path below is relative to resources\app,
# so pin the working directory there no matter where this is launched from.
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..\..'))

if ($Message) {
    .\smart-deploy.ps1 -UpdateType auto -Message $Message
} else {
    .\smart-deploy.ps1 -UpdateType auto
}