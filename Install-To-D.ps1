$ErrorActionPreference = "Stop"

$Source = Split-Path -Parent $MyInvocation.MyCommand.Path
$Target = "D:\Jazztor"
$DriveRoot = "D:\"

if (-not (Test-Path -LiteralPath $DriveRoot)) {
    throw "D: drive was not found. Connect or create the D: drive, then run this script again."
}

$sourceResolved = (Resolve-Path -LiteralPath $Source).Path.TrimEnd('\')
$targetResolved = $Target.TrimEnd('\')

if ($sourceResolved -ieq $targetResolved) {
    Write-Host "JazzTor is already installed at $Target" -ForegroundColor Green
    exit 0
}

if (Test-Path -LiteralPath $Target) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backup = "D:\Jazztor.backup-$stamp"
    Move-Item -LiteralPath $Target -Destination $backup
    Write-Host "Existing folder preserved at $backup" -ForegroundColor Yellow
}

New-Item -ItemType Directory -Path $Target -Force | Out-Null
Copy-Item -Path (Join-Path $Source "*") -Destination $Target -Recurse -Force

Write-Host "JazzTor installed successfully:" -ForegroundColor Green
Write-Host $Target
Write-Host "Open: D:\Jazztor\JazzTor-UI-Prompts-and-Blender-Brief.md"
