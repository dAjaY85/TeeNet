$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
& (Join-Path $PSScriptRoot 'build.ps1') -Target esp32s3_n16r8 -BuildDirectory build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& (Join-Path $PSScriptRoot 'build.ps1') -Target atoms3_lite_8mb -BuildDirectory build-atoms3-lite
exit $LASTEXITCODE
