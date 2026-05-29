# ============================================================
# ScoutNadi - Cloudflare R2 + Supabase Edge Function Setup
# ============================================================
# Script automatik untuk:
# 1. Install Supabase CLI (kalau belum ada)
# 2. Login ke Supabase
# 3. Link projek
# 4. Set environment variables (R2 credentials)
# 5. Deploy edge function r2-presigned-upload
# ============================================================

# ANGKA KEMASKINI: Ganti nilai di bawah dengan kredentials anda
# ============================================================
$config = @{
    SupabaseProjectRef  = 'jvjxeckzmokoqjfsuene'  # Project ref Supabase anda
    R2_ACCOUNT_ID        = ''                      # Dari Cloudflare Dashboard sidebar
    R2_ACCESS_KEY_ID     = ''                      # Dari API Token yang dijana
    R2_SECRET_ACCESS_KEY = ''                      # Dari API Token yang dijana
    R2_BUCKET_NAME       = 'scoutnadi'             # Nama bucket
    R2_PUBLIC_URL        = ''                      # Cth: https://pub-xxx.r2.dev
}
# ============================================================

$ErrorActionPreference = 'Stop'

function Write-Step($message) {
    Write-Host ""
    Write-Host "==> $message" -ForegroundColor Cyan
}

function Write-Success($message) {
    Write-Host "    OK: $message" -ForegroundColor Green
}

function Write-WarningMsg($message) {
    Write-Host "    WARN: $message" -ForegroundColor Yellow
}

function Write-ErrorMsg($message) {
    Write-Host "    ERROR: $message" -ForegroundColor Red
}

# ============================================================
# STEP 0: Validate config
# ============================================================
Write-Step "Validating configuration"

$missing = @()
foreach ($key in @('R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PUBLIC_URL')) {
    if ([string]::IsNullOrWhiteSpace($config[$key])) {
        $missing += $key
    }
}

if ($missing.Count -gt 0) {
    Write-ErrorMsg "Sila isi nilai-nilai ini di bahagian atas script:"
    foreach ($m in $missing) {
        Write-Host "        - $m" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "Edit fail scripts\setup-r2.ps1 dan jalankan semula." -ForegroundColor Yellow
    exit 1
}
Write-Success "Konfigurasi lengkap"

# ============================================================
# STEP 1: Check & install Supabase CLI
# ============================================================
Write-Step "Memeriksa Supabase CLI"

$supabaseCmd = Get-Command supabase -ErrorAction SilentlyContinue
if (-not $supabaseCmd) {
    Write-WarningMsg "Supabase CLI belum dipasang. Memasang sekarang..."
    npm install -g supabase
    if ($LASTEXITCODE -ne 0) {
        Write-ErrorMsg "Gagal install Supabase CLI. Sila install manual: npm install -g supabase"
        exit 1
    }
    Write-Success "Supabase CLI berjaya dipasang"
} else {
    $version = supabase --version 2>&1
    Write-Success "Supabase CLI sudah ada: $version"
}

# ============================================================
# STEP 2: Login ke Supabase (kalau belum)
# ============================================================
Write-Step "Memeriksa status login Supabase"

$projects = supabase projects list 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-WarningMsg "Belum login ke Supabase. Sila ikut arahan di browser..."
    supabase login
    if ($LASTEXITCODE -ne 0) {
        Write-ErrorMsg "Login gagal. Cuba jalankan 'supabase login' secara manual."
        exit 1
    }
    Write-Success "Berjaya login"
} else {
    Write-Success "Sudah login ke Supabase"
}

# ============================================================
# STEP 3: Link projek
# ============================================================
Write-Step "Menghubungkan projek (link)"

$linkResult = supabase link --project-ref $config.SupabaseProjectRef 2>&1
if ($LASTEXITCODE -ne 0) {
    if ($linkResult -match 'already linked') {
        Write-Success "Projek sudah di-link"
    } else {
        Write-ErrorMsg "Link gagal: $linkResult"
        Write-Host "Cuba jalankan manual: supabase link --project-ref $($config.SupabaseProjectRef)" -ForegroundColor Yellow
        exit 1
    }
} else {
    Write-Success "Projek berjaya di-link"
}

# ============================================================
# STEP 4: Set environment variables (R2 secrets)
# ============================================================
Write-Step "Menetapkan environment variables (secrets)"

$secrets = @{
    'R2_ACCOUNT_ID'        = $config.R2_ACCOUNT_ID
    'R2_ACCESS_KEY_ID'     = $config.R2_ACCESS_KEY_ID
    'R2_SECRET_ACCESS_KEY' = $config.R2_SECRET_ACCESS_KEY
    'R2_BUCKET_NAME'       = $config.R2_BUCKET_NAME
    'R2_PUBLIC_URL'        = $config.R2_PUBLIC_URL
}

foreach ($key in $secrets.Keys) {
    $value = $secrets[$key]
    Write-Host "    Setting $key..." -NoNewline
    $output = supabase secrets set "$key=$value" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host " OK" -ForegroundColor Green
    } else {
        Write-Host " FAIL" -ForegroundColor Red
        Write-Host "      $output" -ForegroundColor Red
    }
}
Write-Success "Semua secrets telah ditetapkan"

# ============================================================
# STEP 5: Deploy edge function
# ============================================================
Write-Step "Deploy edge function r2-presigned-upload"

$deployOutput = supabase functions deploy r2-presigned-upload --no-verify-jwt 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-ErrorMsg "Deploy gagal:"
    Write-Host $deployOutput -ForegroundColor Red
    exit 1
}
Write-Success "Edge function r2-presigned-upload berjaya di-deploy"

# ============================================================
# STEP 6: Verify
# ============================================================
Write-Step "Verifikasi"
$functionsList = supabase functions list 2>&1
if ($functionsList -match 'r2-presigned-upload') {
    Write-Success "Function aktif dan boleh diakses"
} else {
    Write-WarningMsg "Function mungkin belum lengkap. Sila semak Supabase Dashboard."
}

Write-Host ""
Write-Host "===========================================================" -ForegroundColor Green
Write-Host " SETUP SELESAI!" -ForegroundColor Green
Write-Host "===========================================================" -ForegroundColor Green
Write-Host ""
Write-Host " Edge function URL:" -ForegroundColor Cyan
Write-Host " https://$($config.SupabaseProjectRef).supabase.co/functions/v1/r2-presigned-upload"
Write-Host ""
Write-Host " Langkah seterusnya:" -ForegroundColor Cyan
Write-Host " 1. Setup CORS pada R2 bucket (lihat scripts\r2-cors-config.json)"
Write-Host " 2. Test upload sijil/dokumen melalui ScoutNadi"
Write-Host ""