$ErrorActionPreference = "Stop"

$Root = "D:\Jazztor"
$AppRoot = Join-Path $Root "app"

if (-not (Test-Path -LiteralPath "D:\")) {
    throw "D: drive was not found. JazzTor is required to run from D:\Jazztor."
}

if (-not (Test-Path -LiteralPath $Root)) {
    throw "JazzTor was not found at D:\Jazztor. Run Install-To-D.ps1 first."
}

$Directories = @(
    "$Root\.temp",
    "$Root\.cache\npm",
    "$Root\.cache\pnpm-store",
    "$Root\.cache\pnpm-virtual",
    "$Root\.cache\yarn",
    "$Root\.cache\pip",
    "$Root\.cache\uv",
    "$Root\.cache\playwright",
    "$Root\.cache\python-bytecode",
    "$Root\.cache\huggingface",
    "$Root\.cache\torch",
    "$Root\.cache\xdg",
    "$Root\.tools\npm-global",
    "$Root\.tools\pnpm",
    "$Root\.blender\config",
    "$Root\.blender\scripts",
    "$Root\.blender\datafiles",
    "$Root\reports"
)

foreach ($Directory in $Directories) {
    New-Item -ItemType Directory -Path $Directory -Force | Out-Null
}

# Process-scoped storage redirection. Nothing below writes persistent global
# Windows settings; every child process launched from this script inherits it.
$env:JAZZTOR_ROOT = $Root
$env:TEMP = "$Root\.temp"
$env:TMP = "$Root\.temp"
$env:TMPDIR = "$Root\.temp"
$env:npm_config_cache = "$Root\.cache\npm"
$env:npm_config_prefix = "$Root\.tools\npm-global"
$env:PNPM_HOME = "$Root\.tools\pnpm"
$env:PNPM_STORE_DIR = "$Root\.cache\pnpm-store"
$env:YARN_CACHE_FOLDER = "$Root\.cache\yarn"
$env:PIP_CACHE_DIR = "$Root\.cache\pip"
$env:UV_CACHE_DIR = "$Root\.cache\uv"
$env:PYTHONPYCACHEPREFIX = "$Root\.cache\python-bytecode"
$env:PLAYWRIGHT_BROWSERS_PATH = "$Root\.cache\playwright"
$env:HF_HOME = "$Root\.cache\huggingface"
$env:TORCH_HOME = "$Root\.cache\torch"
$env:XDG_CACHE_HOME = "$Root\.cache\xdg"
$env:BLENDER_USER_CONFIG = "$Root\.blender\config"
$env:BLENDER_USER_SCRIPTS = "$Root\.blender\scripts"
$env:BLENDER_USER_DATAFILES = "$Root\.blender\datafiles"

Write-Host "JazzTor storage root: $Root" -ForegroundColor Green
Write-Host "Temporary and cache files are redirected under D:\Jazztor." -ForegroundColor Green

if (-not (Test-Path -LiteralPath (Join-Path $AppRoot "package.json"))) {
    Write-Host "No app\package.json is present yet. Storage directories are ready, but the dev server was not started." -ForegroundColor Yellow
    exit 0
}

Set-Location -LiteralPath $AppRoot

if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    pnpm config set store-dir "$Root\.cache\pnpm-store" --location project | Out-Null
    pnpm config set virtual-store-dir "$Root\.cache\pnpm-virtual" --location project | Out-Null
}

if (-not (Test-Path -LiteralPath (Join-Path $AppRoot "node_modules"))) {
    if (Test-Path -LiteralPath (Join-Path $AppRoot "pnpm-lock.yaml")) {
        pnpm install --frozen-lockfile
    }
    elseif (Test-Path -LiteralPath (Join-Path $AppRoot "yarn.lock")) {
        yarn install --immutable
    }
    elseif (Test-Path -LiteralPath (Join-Path $AppRoot "package-lock.json")) {
        npm ci
    }
    else {
        npm install
    }
}

npm run dev -- --host 127.0.0.1 --port 5174
