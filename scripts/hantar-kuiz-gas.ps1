<#
.SYNOPSIS
  Hantar fail kuiz dari docs/quiz-gas ke projek Google Apps Script.

.DESCRIPTION
  Klon projek jauh ke folder sementara DAHULU, salin fail yang berubah ke
  atasnya, kemudian push. Urutan itu disengajakan: "clasp push" menggantikan
  kandungan projek dengan apa yang ada di folder tempatan, jadi push terus
  dari docs/quiz-gas akan:
    - membuang appsscript.json projek (skop OAuth, Advanced Drive Service
      untuk import Word, zon waktu), dan
    - menolak masuk fail mockup *-preview.html sebagai fail HTML sebenar.

  Dengan mengklon dahulu, manifes dan apa-apa fail lain di projek dikekalkan
  seadanya; hanya fail yang disenaraikan di $Fail ditulis ganti.

  NOTA: fail ini sengaja ASCII sahaja. PowerShell 5.1 membaca .ps1 tanpa BOM
  sebagai ANSI, dan aksara UTF-8 seperti tanda sempang panjang menjadi petikan
  pintar yang memecahkan penghurai.

.PARAMETER ScriptId
  ID projek Apps Script. Dapatkannya di editor Apps Script:
  Project Settings > IDs > Script ID.

.PARAMETER Semua
  Hantar SEMUA fail kuiz (8 .gs + 3 .html), bukan hanya yang berubah.

.PARAMETER Paksa
  Langkau soalan pengesahan sebelum push.

.EXAMPLE
  # Sekali sahaja:
  npx clasp login
  # Kemudian:
  .\scripts\hantar-kuiz-gas.ps1 -ScriptId '1AbC...'
#>
param(
  [Parameter(Mandatory = $true)][string]$ScriptId,
  [switch]$Semua,
  [switch]$Paksa
)

$ErrorActionPreference = 'Stop'

$Repo   = Split-Path -Parent $PSScriptRoot
$Sumber = Join-Path $Repo 'docs\quiz-gas'
$Kerja  = Join-Path $env:TEMP ('kuiz-gas-push-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))

# Fail yang berubah untuk ciri pratonton import + padam pukal
$Fail = @('Quiz.gs', 'ImportForm.gs', 'AdminServer.gs', 'Admin.html')
if ($Semua) {
  $Fail = @('Code.gs','Setup.gs','Eligibility.gs','Quiz.gs','Certificate.gs',
            'ImportForm.gs','AdminServer.gs','Teacher.gs',
            'Index.html','Admin.html','Guru.html')
}

if (-not (Test-Path $Sumber)) { throw "Folder sumber tidak dijumpai: $Sumber" }
foreach ($f in $Fail) {
  if (-not (Test-Path (Join-Path $Sumber $f))) { throw "Fail tiada: $f" }
}

Write-Host ''
Write-Host 'Hantar Kuiz ke Apps Script' -ForegroundColor Cyan
Write-Host ('  Script ID : ' + $ScriptId)
Write-Host ('  Fail      : ' + ($Fail -join ', '))
Write-Host ('  Kerja     : ' + $Kerja)
Write-Host ''

# 1) Klon projek jauh (mengekalkan appsscript.json & fail lain)
Write-Host '[1/3] Mengklon projek jauh...' -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $Kerja | Out-Null
Push-Location $Kerja
try {
  & npx clasp clone $ScriptId --rootDir $Kerja
  if ($LASTEXITCODE -ne 0) {
    throw "clasp clone gagal. Sudah jalankan 'npx clasp login'? Script ID betul?"
  }

  # 2) Salin fail yang berubah ke atas klon
  Write-Host ''
  Write-Host '[2/3] Menyalin fail...' -ForegroundColor Yellow
  foreach ($f in $Fail) {
    $dari = Join-Path $Sumber $f
    $ke   = Join-Path $Kerja  $f
    if (Test-Path $ke) { $tanda = 'ganti ' } else { $tanda = 'BAHARU' }
    Copy-Item $dari $ke -Force
    Write-Host ("   [$tanda] $f")
  }

  # 3) Sahkan sebelum menulis ke projek langsung
  Write-Host ''
  if (-not $Paksa) {
    Write-Host 'Ini menulis ke projek Apps Script LANGSUNG.' -ForegroundColor Red
    $jwp = Read-Host 'Teruskan? (taip: ya)'
    if ($jwp -ne 'ya') { Write-Host 'Dibatalkan. Tiada apa dihantar.'; return }
  }

  Write-Host ''
  Write-Host '[3/3] Menghantar...' -ForegroundColor Yellow
  & npx clasp push --force
  if ($LASTEXITCODE -ne 0) { throw 'clasp push gagal.' }

  Write-Host ''
  Write-Host 'Selesai.' -ForegroundColor Green
  Write-Host ''
  Write-Host 'LANGKAH SETERUSNYA (tidak automatik):' -ForegroundColor Cyan
  Write-Host '  1. Apps Script > Deploy > Manage deployments > edit (pensel) >'
  Write-Host '     Version: New version > Deploy.'
  Write-Host '     Tanpa ini, pengguna masih dapat versi lama.'
  Write-Host '  2. Panel admin > Soalan > Import dari Google Form.'
  Write-Host '     Cuba Form BERGAMBAR: laluan Forms REST API dan penukaran'
  Write-Host '     data URI hanya boleh disahkan pada Apps Script sebenar.'
  Write-Host '  3. Panel admin > Soalan: tanda beberapa kotak, cuba padam pukal.'
}
finally {
  Pop-Location
  if (Test-Path $Kerja) {
    Write-Host ''
    Write-Host ("Folder kerja dikekalkan untuk semakan: $Kerja") -ForegroundColor DarkGray
  }
}
