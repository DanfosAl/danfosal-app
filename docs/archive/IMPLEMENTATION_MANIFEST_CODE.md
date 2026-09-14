# IMPLEMENTATION MANIFEST (CODE + PROMPTS + FULL STEPS)
## Project: Danfos.EasyPOS.PrintCaptureService (EMF spool capture → PNG)

This manifest contains the step-by-step implementation plan **including code blocks** and **agent prompts**.  
It is designed to be copy/pasted to a VS coding agent.

---

## A) Overview
We capture EasyPOS invoices **without changing** printing behavior.

- EasyPOS prints to the real printer (PS80) as normal.
- Windows spools the job as **NT EMF 1.008** (EMF inside SPL wrapper).
- Our service listens for **PrintService Event ID 307** (Document printed).
- For each matching job:
  - copy `.SPL` (and `.SHD` if present)
  - extract EMF payload
  - render to PNG at a stable thermal width (default 576px)
  - write metadata JSON
  - (optional) copy raw SPL for debugging

**Output Contract**
- `C:\Danfosal\Inbox\EasyPOS\Receipt_<yyyyMMdd_HHmmss>_<JobId>.png`
- `C:\Danfosal\Inbox\EasyPOS\Receipt_<yyyyMMdd_HHmmss>_<JobId>.json`
- Raw copy (optional): `C:\Danfosal\Inbox\EasyPOS\Raw\Receipt_<...>.spl`

---

## B) Folder Structure (create in repo)
**AGENT PROMPT:**  
Create a new folder `tools/easypos-print-capture/` and place a .NET solution there. Do not modify Danfosal OCR black box files.

```
tools/
  easypos-print-capture/
    Danfos.EasyPOS.PrintCaptureService.sln
    src/
      Danfos.EasyPOS.PrintCaptureService/
        Program.cs
        Worker.cs
        Spool/
          SpoolJobLocator.cs
          EmfExtractor.cs
          EmfRenderer.cs
        appsettings.json
    scripts/
      install-service.ps1
      uninstall-service.ps1
      debug-run.ps1
    README.md
```

---

## C) Project Setup

### 1) Create solution + worker service
**AGENT PROMPT:**  
Create a .NET 8 Worker Service targeting `net8.0-windows`. Enable Windows Service hosting. Use System.Drawing for EMF rendering.

```powershell
mkdir tools\easypos-print-capture
cd tools\easypos-print-capture
dotnet new sln -n Danfos.EasyPOS.PrintCaptureService
dotnet new worker -n Danfos.EasyPOS.PrintCaptureService -o src\Danfos.EasyPOS.PrintCaptureService -f net8.0-windows
dotnet sln add .\src\Danfos.EasyPOS.PrintCaptureService\Danfos.EasyPOS.PrintCaptureService.csproj
```

### 2) Update csproj
**AGENT PROMPT:**  
Update the csproj to run as a Windows service and use Windows-only APIs.

```xml
<Project Sdk="Microsoft.NET.Sdk.Worker">
  <PropertyGroup>
    <TargetFramework>net8.0-windows</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <UseWindowsService>true</UseWindowsService>
    <InvariantGlobalization>true</InvariantGlobalization>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.Extensions.Hosting.WindowsServices" Version="8.0.0" />
  </ItemGroup>
</Project>
```

---

## D) Configuration (appsettings.json)
**AGENT PROMPT:**  
Add `appsettings.json` to configure printer name, spool directory, output folders, DPI and width.

```json
{
  "Capture": {
    "PrinterName": "PS80_REAL",
    "SpoolDir": "C:\\Windows\\System32\\spool\\PRINTERS",
    "OutDir": "C:\\Danfosal\\Inbox\\EasyPOS",
    "RawDir": "C:\\Danfosal\\Inbox\\EasyPOS\\Raw",
    "LogFile": "C:\\Danfosal\\Logs\\easypos-capture.log",
    "PngWidthPx": 576,
    "Dpi": 300,
    "StabilityDelayMs": 600
  }
}
```

---

## E) Code

### 1) Program.cs (Windows Service Host)
**AGENT PROMPT:**  
Implement Windows Service hosting and register the Worker.

```csharp
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

IHost host = Host.CreateDefaultBuilder(args)
  .UseWindowsService()
  .ConfigureServices((context, services) =>
  {
    services.AddHostedService<Worker>();
  })
  .Build();

await host.RunAsync();
```

---

### 2) Worker.cs — subscribe to PrintService Operational log
**AGENT PROMPT:**  
Implement an EventLogWatcher on `Microsoft-Windows-PrintService/Operational`, filter EventID=307, match PrinterName, extract JobId and start the capture pipeline.

```csharp
using System.Diagnostics.Eventing.Reader;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Configuration;

public class Worker : BackgroundService
{
  private readonly IConfiguration _config;
  private EventLogWatcher? _watcher;

  public Worker(IConfiguration config) => _config = config;

  protected override Task ExecuteAsync(CancellationToken stoppingToken)
  {
    var printerName = _config["Capture:PrinterName"] ?? "PS80_REAL";

    var query = new EventLogQuery(
      "Microsoft-Windows-PrintService/Operational",
      PathType.LogName,
      "*[System[(EventID=307)]]"
    );

    _watcher = new EventLogWatcher(query);
    _watcher.EventRecordWritten += (s, e) =>
    {
      if (e.EventRecord == null) return;

      try
      {
        var xml = e.EventRecord.ToXml();

        if (!xml.Contains(printerName, StringComparison.OrdinalIgnoreCase))
          return;

        var jobId = Spool.SpoolJobLocator.TryExtractJobId(xml);
        if (jobId == null) return;

        _ = Task.Run(async () =>
        {
          await Spool.SpoolJobLocator.ProcessJobAsync(_config, jobId.Value);
        });
      }
      catch
      {
        // keep service resilient; log later if desired
      }
    };

    _watcher.Enabled = true;
    return Task.CompletedTask;
  }

  public override void Dispose()
  {
    _watcher?.Dispose();
    base.Dispose();
  }
}
```

---

### 3) SpoolJobLocator.cs — find SPL, copy, extract EMF, render PNG
**AGENT PROMPT:**  
Create the capture pipeline. Wait for SPL to appear and stabilize, copy to Raw, extract EMF, render PNG, write metadata JSON.

```csharp
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Extensions.Configuration;

namespace Spool;

public static class SpoolJobLocator
{
  public static int? TryExtractJobId(string eventXml)
  {
    const string token = "Name=\"JobId\">";
    var idx = eventXml.IndexOf(token, StringComparison.OrdinalIgnoreCase);
    if (idx < 0) return null;
    idx += token.Length;
    var end = eventXml.IndexOf('<', idx);
    if (end < 0) return null;
    if (int.TryParse(eventXml[idx..end], out var jobId)) return jobId;
    return null;
  }

  public static async Task ProcessJobAsync(IConfiguration config, int jobId)
  {
    var spoolDir = config["Capture:SpoolDir"]!;
    var outDir   = config["Capture:OutDir"]!;
    var rawDir   = config["Capture:RawDir"]!;
    var widthPx  = int.Parse(config["Capture:PngWidthPx"] ?? "576");
    var dpi      = int.Parse(config["Capture:Dpi"] ?? "300");
    var delayMs  = int.Parse(config["Capture:StabilityDelayMs"] ?? "600");

    Directory.CreateDirectory(outDir);
    Directory.CreateDirectory(rawDir);
    Directory.CreateDirectory(Path.Combine(outDir, "Failed"));

    var splName = jobId.ToString("D5") + ".SPL";
    var splPath = Path.Combine(spoolDir, splName);

    // Wait for spool file
    for (int i = 0; i < 30; i++)
    {
      if (File.Exists(splPath)) break;
      await Task.Delay(200);
    }
    if (!File.Exists(splPath)) return;

    // Wait until stable size
    long last = -1;
    for (int i = 0; i < 10; i++)
    {
      var len = new FileInfo(splPath).Length;
      if (len > 0 && len == last) break;
      last = len;
      await Task.Delay(delayMs);
    }

    var timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
    var baseName = $"Receipt_{timestamp}_{jobId:D5}";
    var rawCopy = Path.Combine(rawDir, baseName + ".spl");
    File.Copy(splPath, rawCopy, overwrite: true);

    var splBytes = await File.ReadAllBytesAsync(rawCopy);
    var emfBytes = EmfExtractor.TryExtractEmf(splBytes);

    if (emfBytes == null)
    {
      await File.WriteAllTextAsync(
        Path.Combine(outDir, "Failed", baseName + ".txt"),
        "Failed to extract EMF signature from SPL."
      );
      return;
    }

    var emfPath = Path.Combine(rawDir, baseName + ".emf");
    await File.WriteAllBytesAsync(emfPath, emfBytes);

    var pngPath = Path.Combine(outDir, baseName + ".png");
    EmfRenderer.RenderEmfToPng(emfPath, pngPath, widthPx, dpi);

    var sha = Convert.ToHexString(SHA256.HashData(emfBytes));
    var meta = new
    {
      jobId,
      timestamp,
      pngPath,
      emfPath,
      sha256 = sha
    };

    var jsonPath = Path.Combine(outDir, baseName + ".json");
    await File.WriteAllTextAsync(jsonPath,
      JsonSerializer.Serialize(meta, new JsonSerializerOptions { WriteIndented = true }));
  }
}
```

---

### 4) EmfExtractor.cs — extract EMF payload from SPL wrapper
**AGENT PROMPT:**  
Implement a robust payload finder. Search for the EMF signature (little-endian “ EMF”), then scan backwards for `iType==1` ENHMETAHEADER. Return EMF bytes from that start to EOF.

```csharp
namespace Spool;

public static class EmfExtractor
{
  // " EMF" in ASCII: 20 45 4D 46
  private static readonly byte[] EmfSig = { 0x20, 0x45, 0x4D, 0x46 };

  public static byte[]? TryExtractEmf(byte[] spl)
  {
    int sigIndex = IndexOf(spl, EmfSig);
    if (sigIndex < 0) return null;

    // Scan backward to find ENHMETAHEADER start where iType == 1
    int startScan = Math.Max(0, sigIndex - 256);
    for (int i = sigIndex; i >= startScan; i--)
    {
      if (i + 4 > spl.Length) continue;
      int iType = BitConverter.ToInt32(spl, i);
      if (iType == 1)
      {
        int localSig = IndexOf(spl, EmfSig, i, Math.Min(256, spl.Length - i));
        if (localSig >= 0 && (localSig - i) < 80)
        {
          var emf = new byte[spl.Length - i];
          Buffer.BlockCopy(spl, i, emf, 0, emf.Length);
          return emf;
        }
      }
    }

    // Fallback: start a bit before signature
    int fallback = Math.Max(0, sigIndex - 64);
    var emf2 = new byte[spl.Length - fallback];
    Buffer.BlockCopy(spl, fallback, emf2, 0, emf2.Length);
    return emf2;
  }

  private static int IndexOf(byte[] haystack, byte[] needle, int start = 0, int count = -1)
  {
    if (count < 0) count = haystack.Length - start;
    for (int i = start; i <= start + count - needle.Length; i++)
    {
      bool ok = true;
      for (int j = 0; j < needle.Length; j++)
      {
        if (haystack[i + j] != needle[j]) { ok = false; break; }
      }
      if (ok) return i;
    }
    return -1;
  }
}
```

---

### 5) EmfRenderer.cs — render EMF to PNG
**AGENT PROMPT:**  
Render EMF via System.Drawing.Metafile onto a bitmap. Fixed width (e.g. 576px) and scaled height. White background.

```csharp
using System.Drawing;
using System.Drawing.Imaging;

namespace Spool;

public static class EmfRenderer
{
  public static void RenderEmfToPng(string emfPath, string pngPath, int targetWidthPx, int dpi)
  {
    using var emf = new Metafile(emfPath);
    using var g0 = Graphics.FromHwnd(IntPtr.Zero);

    var bounds = emf.GetBounds(ref g0);

    float scale = targetWidthPx / bounds.Width;
    int targetHeight = (int)Math.Ceiling(bounds.Height * scale);

    using var bmp = new Bitmap(targetWidthPx, targetHeight);
    bmp.SetResolution(dpi, dpi);

    using var g = Graphics.FromImage(bmp);
    g.Clear(Color.White);
    g.ScaleTransform(scale, scale);
    g.DrawImage(emf, new RectangleF(0, 0, bounds.Width, bounds.Height));

    bmp.Save(pngPath, ImageFormat.Png);
  }
}
```

---

## F) Scripts

### 1) scripts\install-service.ps1
**AGENT PROMPT:**  
Publish and install as a Windows Service using `sc.exe`. Inform Kushtrim that admin is required.

```powershell
param(
  [string]$ServiceName = "DanfosEasyPOSCapture",
  [string]$DisplayName = "Danfos EasyPOS Receipt Capture Service"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$proj = Join-Path $root "src\Danfos.EasyPOS.PrintCaptureService\Danfos.EasyPOS.PrintCaptureService.csproj"
$out  = Join-Path $root "publish"

dotnet publish $proj -c Release -o $out

$exe = Join-Path $out "Danfos.EasyPOS.PrintCaptureService.exe"

Write-Host "Installing service: $ServiceName"
sc.exe create $ServiceName binPath= "`"$exe`"" DisplayName= "`"$DisplayName`"" start= auto
sc.exe start $ServiceName

Write-Host "DONE. Logs: C:\Danfosal\Logs\easypos-capture.log"
```

### 2) scripts\uninstall-service.ps1
```powershell
param([string]$ServiceName = "DanfosEasyPOSCapture")
sc.exe stop $ServiceName
sc.exe delete $ServiceName
```

### 3) scripts\debug-run.ps1
```powershell
$root = Split-Path -Parent $PSScriptRoot
$proj = Join-Path $root "src\Danfos.EasyPOS.PrintCaptureService"
dotnet run --project $proj
```

---

## G) Mandatory “Agent Notify Kushtrim” points
The agent must stop and ask for confirmation at these points:

1) Confirm printer name exactly (Control Panel display name)  
2) Enable PrintService Operational log  
3) Enable Keep printed documents (at least for validation)  
4) Run install script as admin  
5) If output PNG scaling needs tuning (width/DPI), ask Kushtrim for a sample print to verify

---

## H) Validation
1) Run `scripts\debug-run.ps1`  
2) Print an invoice from EasyPOS  
3) Confirm output in `C:\Danfosal\Inbox\EasyPOS\`  
4) Open PNG: ensure readability, correct proportions, QR/logo visible  
5) Stop service: print should still work (fail-open)

---

## I) Notes / Future improvements
- Add proper XML parsing for EventRecord XML (instead of string search)
- Improve EMF extraction heuristics (validate header size / record count)
- Add dedupe window (JobId reuse edge cases)
- Optionally delete printer queue job entry after capture (only if safe)
