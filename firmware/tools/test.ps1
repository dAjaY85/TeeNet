$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'test_wasi.ps1')
exit $LASTEXITCODE
