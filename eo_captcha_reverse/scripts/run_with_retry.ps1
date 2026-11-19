#!/usr/bin/env pwsh
# Retry wrapper: tdc_key3 cannot extract ~1 in 6 builds, so re-run with a fresh session.
# Exit codes from e76: 0 = passed, 3 = key extraction failed, 2 = verify rejected, 1 = setup error.
param([int]$MaxTries = 5)
$env:NODE_NO_WARNINGS = '1'
for ($i = 1; $i -le $MaxTries; $i++) {
    Write-Output "=== attempt $i / $MaxTries ==="
    node scripts\e76_online_vm.mjs 2>&1 | Select-String -Pattern '^\[1\]|^\[1b\]|^\[2\]|fixed slots|errorCode|TICKET|target' | ForEach-Object { $_.Line }
    $code = $LASTEXITCODE
    if ($code -eq 0) {
        Write-Output "=== PASSED on attempt $i ==="
        exit 0
    }
    if ($code -eq 3) { Write-Output "  (key3 could not extract this build, retrying with a fresh session)" }
    elseif ($code -eq 2) { Write-Output "  (verify rejected, retrying)" }
    Start-Sleep -Seconds 2
}
Write-Output "=== gave up after $MaxTries attempts ==="
exit 1
