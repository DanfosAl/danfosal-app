using System.Drawing;
using System.Drawing.Imaging;

namespace Spool;

public static class EmfRenderer
{
  public static void RenderEmfToPng(string emfPath, string pngPath, int targetWidthPx, int dpi)
  {
    using var emf = new Metafile(emfPath);
    
    Graphics? g0 = null;
    try
    {
      g0 = Graphics.FromHwnd(IntPtr.Zero);
      GraphicsUnit pageUnit = GraphicsUnit.Pixel;
      var bounds = emf.GetBounds(ref pageUnit);

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
    finally
    {
      g0?.Dispose();
    }
  }
}
