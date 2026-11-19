#!/usr/bin/env pwsh
# One bisect round: fresh session -> capture -> key3 -> local VM -> replace SLOTS -> submit.
param([string]$Slots = "half1", [string]$Cap = "capture14")
$ErrorActionPreference = "Continue"
$env:SLOTS = $Slots
Write-Output "=== round SLOTS=$Slots capture=$Cap ==="
node scripts\e105_exp_all_local.mjs 2>&1 | Select-String -Pattern '^\[|replaced|errorCode' | Select-Object -First 12
