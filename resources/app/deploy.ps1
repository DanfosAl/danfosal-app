#!/usr/bin/env pwsh
# Quick deploy shortcut - uses smart deployment
param(
    [string]$Message = ""
)

if ($Message) {
    .\smart-deploy.ps1 -UpdateType auto -Message $Message
} else {
    .\smart-deploy.ps1 -UpdateType auto
}