# JazzTor D-drive-only storage policy

## Non-negotiable rule

All controllable JazzTor project files, generated resources, build outputs,
temporary renders and development caches must be created under:

```text
D:\Jazztor
```

Do not create JazzTor resources under `C:\`, `%USERPROFILE%`, `%APPDATA%`,
`%LOCALAPPDATA%`, the Windows desktop, Downloads, Documents, or the system
temporary directory.

Always start development through:

```powershell
D:\Jazztor\Start-Jazztor-Dev.ps1
```

That launcher redirects process-level temporary and cache locations for npm,
pnpm, Yarn, Python, uv, Playwright, Hugging Face, Torch, Blender and general
temporary files to folders below `D:\Jazztor`.

## Required paths

| Purpose | Location |
|---|---|
| Temporary files | `D:\Jazztor\.temp` |
| Package/tool caches | `D:\Jazztor\.cache` |
| Project-local tools | `D:\Jazztor\.tools` |
| Blender runtime data | `D:\Jazztor\.blender` |
| Source art | `D:\Jazztor\assets` |
| Blender source | `D:\Jazztor\blender\source` |
| Runtime GLB | `D:\Jazztor\blender\exports` |
| Audio | `D:\Jazztor\audio` |
| Frontend | `D:\Jazztor\app` |
| Reports | `D:\Jazztor\reports` |

Windows itself, installed applications and browsers may still maintain their
own system-level data on the operating-system drive. This policy controls all
JazzTor paths and all cache/temp variables exposed to JazzTor child processes;
it does not claim to override inaccessible operating-system storage behavior.
