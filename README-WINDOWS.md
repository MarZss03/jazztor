# JazzTor Windows installation

Target folder: `D:\Jazztor`

1. Extract the downloaded ZIP.
2. On a Windows computer, right-click `Install-To-D.ps1` and choose **Run with PowerShell**.
3. If Windows blocks the script, open PowerShell in the extracted folder and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\Install-To-D.ps1
```

The installer preserves an existing `D:\Jazztor` folder by renaming it to a timestamped backup before copying the new package.

After installation, open:

```text
D:\Jazztor\JazzTor-UI-Prompts-and-Blender-Brief.md
```

All 3D production paths in the design bible use `D:\Jazztor` as the project root.
