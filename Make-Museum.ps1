# One-click pipeline for the standalone museum room (all files stay on D:, see D-DRIVE-STORAGE-POLICY.md).
#   .\Make-Museum.ps1                 full: textures + build + final bake (2048 px, 512 spp, OIDN) + pack + LODs + compress
#   .\Make-Museum.ps1 -Preview        fast pass for front-end work (1024 px, 24 spp, ~1 min)
#   .\Make-Museum.ps1 -SkipBuild      re-bake / re-pack the existing JT_Museum.blend (lighting tweaks only)
#   .\Make-Museum.ps1 -Ref            Cycles reference renders only (blender/renders/museum_ref_*.png)
param([switch]$Preview, [switch]$SkipBuild, [switch]$Ref, [int]$Size = 2048, [int]$Samples = 512)
$ErrorActionPreference = 'Continue' # native stderr (Blender warnings) must not abort; exit codes are checked per step
. D:\Jazztor\Use-JazztorEnv.ps1
$blender = 'D:\Blender\blender-5.4.0-alpha+main.b1d561a6c0d6-windows.amd64-release\blender.exe'
$S = 'D:\Jazztor\blender\scripts'
$t0 = Get-Date
function Step($name, [scriptblock]$run) {
  $t = Get-Date
  Write-Host "== $name" -ForegroundColor Yellow
  & $run
  if ($LASTEXITCODE) { throw "$name failed ($LASTEXITCODE)" }
  Write-Host ("   {0:n1} s" -f ((Get-Date) - $t).TotalSeconds)
}
function Blender([string[]]$a, $pattern = 'MUSEUM|Traceback|Error:|line \d') {
  & $blender @a 2>&1 | Select-String -Pattern $pattern | ForEach-Object { "   $_" }
}

if (-not $SkipBuild -and -not $Ref) {
  Step 'textures' { Blender @('-b', '--factory-startup', '--python', "$S\gen_museum_textures.py") }
  Step 'build' { Blender @('-b', '--factory-startup', '--python', "$S\build_museum.py") }
}
if ($Ref) {
  Step 'reference renders' { Blender @('-b', 'D:\Jazztor\blender\source\JT_Museum.blend', '--python', "$S\bake_museum.py", '--', '--ref') }
  return
}
$bakeArgs = if ($Preview) { @('--preview', '1024', '24') } else { @("$Size", "$Samples") }
Step 'bake (Cycles: lightmaps closed/open + room panoramas + GLB)' {
  Blender (@('-b', 'D:\Jazztor\blender\source\JT_Museum.blend', '--python', "$S\bake_museum.py", '--') + $bakeArgs)
}
Set-Location D:\Jazztor\app
Step 'pack lightmaps (JPEG + 2048 low tier)' { node scripts/pack-lighting.mjs D:/Jazztor/app/public/assets/museum }
Step 'LODs' { Blender @('-b', '--factory-startup', '--python', "$S\export_museum_lods.py") }
Step 'compress (Draco + KTX2, all tiers)' { node scripts/compress.mjs --only JT_Museum }
Write-Host ("museum ready in {0:n1} min" -f ((Get-Date) - $t0).TotalMinutes) -ForegroundColor Green
