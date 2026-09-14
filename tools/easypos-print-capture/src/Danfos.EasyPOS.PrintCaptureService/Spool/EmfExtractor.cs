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
