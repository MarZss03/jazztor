# Dot-source before any JazzTor build/test command:  . D:\Jazztor\Use-JazztorEnv.ps1
# Same process-scoped redirection as Start-Jazztor-Dev.ps1, without starting the dev server.
$Root = "D:\Jazztor"
if (-not (Test-Path -LiteralPath $Root)) { throw "D:\Jazztor not found - refusing to fall back to C:" }
foreach ($d in ".temp", ".cache\npm", ".cache\playwright", ".cache\xdg", ".cache\python-bytecode", ".tools\npm-global",
               ".blender\config", ".blender\scripts", ".blender\datafiles", "reports") {
  New-Item -ItemType Directory -Path (Join-Path $Root $d) -Force | Out-Null
}
$env:JAZZTOR_ROOT = $Root
$env:TEMP = "$Root\.temp"; $env:TMP = "$Root\.temp"; $env:TMPDIR = "$Root\.temp"
$env:npm_config_cache = "$Root\.cache\npm"; $env:npm_config_prefix = "$Root\.tools\npm-global"
$env:PLAYWRIGHT_BROWSERS_PATH = "$Root\.cache\playwright"; $env:XDG_CACHE_HOME = "$Root\.cache\xdg"
$env:PYTHONPYCACHEPREFIX = "$Root\.cache\python-bytecode"
$env:BLENDER_USER_CONFIG = "$Root\.blender\config"; $env:BLENDER_USER_SCRIPTS = "$Root\.blender\scripts"
$env:BLENDER_USER_DATAFILES = "$Root\.blender\datafiles"
