param(
  [string]$In,
  [string]$Out,
  [int]$Tol = 60,
  [int]$MaxSize = 256
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Collections.Generic;
public static class KeyerOne {
  public static void Process(string inPath, string outPath, int tol, int maxSize) {
    Bitmap bmp = new Bitmap(inPath);
    int w = bmp.Width, h = bmp.Height;
    BitmapData d = bmp.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
    int stride = d.Stride;
    byte[] px = new byte[stride * h];
    Marshal.Copy(d.Scan0, px, 0, px.Length);
    bmp.UnlockBits(d);
    int rmin = 255, rmax = 0, gmin = 255, gmax = 0, bmin = 255, bmax = 0;
    for (int x = 0; x < w; x++) {
      for (int yy = 0; yy < 3; yy++) {
        int o1 = yy * stride + x * 4, o2 = (h - 1 - yy) * stride + x * 4;
        rmin = Math.Min(rmin, Math.Min(px[o1 + 2], px[o2 + 2])); rmax = Math.Max(rmax, Math.Max(px[o1 + 2], px[o2 + 2]));
        gmin = Math.Min(gmin, Math.Min(px[o1 + 1], px[o2 + 1])); gmax = Math.Max(gmax, Math.Max(px[o1 + 1], px[o2 + 1]));
        bmin = Math.Min(bmin, Math.Min(px[o1], px[o2])); bmax = Math.Max(bmax, Math.Max(px[o1], px[o2]));
      }
    }
    for (int y = 0; y < h; y++) {
      for (int xx = 0; xx < 3; xx++) {
        int o1 = y * stride + xx * 4, o2 = y * stride + (w - 1 - xx) * 4;
        rmin = Math.Min(rmin, Math.Min(px[o1 + 2], px[o2 + 2])); rmax = Math.Max(rmax, Math.Max(px[o1 + 2], px[o2 + 2]));
        gmin = Math.Min(gmin, Math.Min(px[o1 + 1], px[o2 + 1])); gmax = Math.Max(gmax, Math.Max(px[o1 + 1], px[o2 + 1]));
        bmin = Math.Min(bmin, Math.Min(px[o1], px[o2])); bmax = Math.Max(bmax, Math.Max(px[o1], px[o2]));
      }
    }
    rmin -= tol; rmax += tol; gmin -= tol; gmax += tol; bmin -= tol; bmax += tol;
    bool[] bg = new bool[w * h];
    Stack<int> stack = new Stack<int>();
    for (int x = 0; x < w; x++) { stack.Push(x); stack.Push((h - 1) * w + x); }
    for (int y = 0; y < h; y++) { stack.Push(y * w); stack.Push(y * w + w - 1); }
    while (stack.Count > 0) {
      int idx = stack.Pop();
      if (bg[idx]) continue;
      int o = (idx / w) * stride + (idx % w) * 4;
      int r = px[o + 2], g = px[o + 1], b = px[o];
      if (r < rmin || r > rmax || g < gmin || g > gmax || b < bmin || b > bmax) continue;
      bg[idx] = true;
      int x = idx % w, y = idx / w;
      if (x > 0) stack.Push(idx - 1);
      if (x < w - 1) stack.Push(idx + 1);
      if (y > 0) stack.Push(idx - w);
      if (y < h - 1) stack.Push(idx + w);
    }
    int keyed = 0;
    for (int i = 0; i < w * h; i++) {
      if (bg[i]) {
        int o = (i / w) * stride + (i % w) * 4;
        px[o] = 0; px[o + 1] = 0; px[o + 2] = 0; px[o + 3] = 0;
        keyed++;
      }
    }
    int minX = w, minY = h, maxX = 0, maxY = 0;
    for (int i = 0; i < w * h; i++) {
      if (px[i * 4 + 3] == 0) continue;
      int x = i % w, y = i / w;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    int pad = 8;
    minX = Math.Max(0, minX - pad); minY = Math.Max(0, minY - pad);
    maxX = Math.Min(w - 1, maxX + pad); maxY = Math.Min(h - 1, maxY + pad);
    int cw = maxX - minX + 1, ch = maxY - minY + 1;
    double scale = Math.Min(1.0, (double)maxSize / Math.Max(cw, ch));
    int ow = Math.Max(1, (int)(cw * scale)), oh = Math.Max(1, (int)(ch * scale));
    Bitmap outBmp = new Bitmap(ow, oh);
    BitmapData od = outBmp.LockBits(new Rectangle(0, 0, ow, oh), ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
    byte[] opx = new byte[od.Stride * oh];
    for (int y = 0; y < oh; y++) for (int x = 0; x < ow; x++) {
      int sx = minX + x, sy = minY + y;
      int doff = y * od.Stride + x * 4;
      if (sx >= w || sy >= h) continue;
      int soff = sy * stride + sx * 4;
      opx[doff] = px[soff]; opx[doff + 1] = px[soff + 1]; opx[doff + 2] = px[soff + 2]; opx[doff + 3] = px[soff + 3];
    }
    Marshal.Copy(opx, 0, od.Scan0, opx.Length);
    outBmp.UnlockBits(od);
    outBmp.Save(outPath, ImageFormat.Png);
    Console.WriteLine("keyed " + keyed + " | " + cw + "x" + ch + " -> " + ow + "x" + oh);
    bmp.Dispose(); outBmp.Dispose();
  }
}
'@
[KeyerOne]::Process($In, $Out, $Tol, $MaxSize)
