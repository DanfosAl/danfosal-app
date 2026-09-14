using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Extensions.Configuration;

namespace Spool;

public static class SpoolJobLocator
{
  public static int? TryExtractJobId(string eventXml)
  {
    // Event XML format: <Param1>11</Param1> where Param1 is the Job/Document ID
    const string token = "<Param1>";
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
    
    // Robust copy with retry for file locks
    byte[] splBytes;
    for (int retry = 0; retry < 5; retry++)
    {
      try
      {
        splBytes = await File.ReadAllBytesAsync(splPath);
        await File.WriteAllBytesAsync(rawCopy, splBytes);
        break;
      }
      catch (IOException)
      {
        if (retry == 4) return;
        await Task.Delay(500);
      }
    }

    splBytes = await File.ReadAllBytesAsync(rawCopy);
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
