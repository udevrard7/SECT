# SECT-PWA-MSIX-1 : génère le package .msix avec MakeAppx (Windows SDK)
#
# Prérequis :
#   - Windows 10/11
#   - Windows SDK (MakeAppx.exe) — installé avec Visual Studio ou standalone
#   - Python 3 (pour generate-msix.py)
#
# Usage (depuis windows-store/msix/) :
#   python generate-msix.py                        # prépare staging/
#   powershell -ExecutionPolicy Bypass -File make-msix.ps1
#
# Output :
#   packages/sect-1.0.0.0.msix  (package non signé — le Store signera)
#
# Voir windows-store/README.md pour le processus complet.

param(
    [string]$OutputDir = "..\packages",
    [string]$AppName = "sect",
    [string]$Version = "1.0.0.0"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$StagingDir = Join-Path $ScriptDir "staging"

Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  SECT — Génération du package MSIX" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# 1. Vérifier que staging/ existe
if (-not (Test-Path $StagingDir)) {
    Write-Host "❌ Dossier staging/ introuvable." -ForegroundColor Red
    Write-Host "   Lancez d'abord : python generate-msix.py" -ForegroundColor Yellow
    exit 1
}

# 2. Trouver MakeAppx.exe (Windows SDK)
$makeAppx = $null
$sdkPaths = @(
    "${env:ProgramFiles(x86)}\Windows Kits\10\bin",
    "${env:ProgramFiles}\Windows Kits\10\bin"
)

foreach ($basePath in $sdkPaths) {
    if (Test-Path $basePath) {
        # Trouver la version la plus récente
        $versions = Get-ChildItem $basePath -Directory | Sort-Object Name -Descending
        foreach ($ver in $versions) {
            $exePath = Join-Path $ver.FullName "x64\makeappx.exe"
            if (Test-Path $exePath) {
                $makeAppx = $exePath
                break
            }
        }
        if ($makeAppx) { break }
    }
}

if (-not $makeAppx) {
    Write-Host "❌ MakeAppx.exe introuvable." -ForegroundColor Red
    Write-Host ""
    Write-Host "Installez Windows SDK :" -ForegroundColor Yellow
    Write-Host "  Option A : Visual Studio Installer → 'Desktop development with C++'" -ForegroundColor White
    Write-Host "  Option B : https://developer.microsoft.com/windows/downloads/windows-sdk/" -ForegroundColor White
    Write-Host ""
    Write-Host "Alternative : utilisez pwabuilder.com (pas de SDK requis)" -ForegroundColor Yellow
    Write-Host "  1. https://www.pwabuilder.com/" -ForegroundColor White
    Write-Host "  2. URL : https://sect-app.vercel.app" -ForegroundColor White
    Write-Host "  3. Package For Stores → Windows" -ForegroundColor White
    exit 1
}

Write-Host "✓ MakeAppx trouvé : $makeAppx" -ForegroundColor Green

# 3. Créer le dossier output
$OutputPath = Join-Path $ScriptDir $OutputDir
if (-not (Test-Path $OutputPath)) {
    New-Item -ItemType Directory -Path $OutputPath -Force | Out-Null
}
$MsixFile = Join-Path $OutputPath "$AppName-$Version.msix"

# 4. Packager avec MakeAppx
Write-Host ""
Write-Host "→ Génération du package MSIX..." -ForegroundColor Yellow

& $makeAppx pack /d $StagingDir /p $MsixFile /v 2>&1 | ForEach-Object { Write-Host $_ }

if (Test-Path $MsixFile) {
    $size = (Get-Item $MsixFile).Length
    Write-Host ""
    Write-Host "✓ Package MSIX généré : $MsixFile" -ForegroundColor Green
    Write-Host "  Taille : $([math]::Round($size / 1KB, 1)) KB" -ForegroundColor Green
    Write-Host ""
    Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  Prochaines étapes :" -ForegroundColor Cyan
    Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  1. Créer un compte Partner Center :" -ForegroundColor White
    Write-Host "     https://partner.microsoft.com/dashboard/registration" -ForegroundColor White
    Write-Host "  2. Réserver le nom 'SECT'" -ForegroundColor White
    Write-Host "  3. Uploader $AppName-$Version.msix dans Submit > Packages" -ForegroundColor White
    Write-Host "  4. Remplir le Store listing (voir store-listing.json)" -ForegroundColor White
    Write-Host "  5. Soumettre (certification 24-48h)" -ForegroundColor White
} else {
    Write-Host "❌ Échec de la génération du package" -ForegroundColor Red
    exit 1
}
