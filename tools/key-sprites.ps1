$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Collections.Generic;
public static class Keyer {
  public static void Process(string inPath, string outPath, int tol, int maxSize) {
    Bitmap bmp = new Bitmap(inPath);
    int w = bmp.Width, h = bmp.Height;
    BitmapData d = bmp.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
    int stride = d.Stride;
    byte[] px = new byte[stride * h];
    Marshal.Copy(d.Scan0, px, 0, px.Length);
    bmp.UnlockBits(d);
    // border scan: background gradient range per channel
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
    // flood fill from borders over in-range pixels
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
    Console.WriteLine("keyed: " + keyed + " box: " + rmin + "-" + rmax + "/" + gmin + "-" + gmax + "/" + bmin + "-" + bmax);
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
    Console.WriteLine(cw + "x" + ch + " -> " + ow + "x" + oh);
    bmp.Dispose(); outBmp.Dispose();
  }
}
'@

$src = 'C:\Users\17748\AppData\Roaming\CindyGlobal\cindy-media\blobs'
$dst = 'C:\Users\17748\AppData\Roaming\CindyGlobal\owners\aa142c1c35e48af9e5d1\dialogues\2026-10-25\def21351-be9e-4040-a89a-cea1331bff91\zombie-waves\sprites'
New-Item -ItemType Directory -Force -Path $dst | Out-Null
$map = [ordered]@{
  'player'      = 'cd\cd33397d455c4556835684e51f395c2b7ed6294a3aa79dd6ca8fe55ad7a0411d.png'
  'zombie'      = '66\66db54831a6ed4791f41703a9269475d8a3b2cc55a3decf62bda30ab21ce0daa.png'
  'fast'        = 'dd\ddacf715c8b75a5efecf3bf8da68176885a6594ff5c4ee48e5ad59f4f1f6c881.png'
  'brute'       = 'b0\b0c1cb8c822f441f59e19fdd2fb5a0b83d7d3b52292f85fbe1252b7691354707.png'
  'boss'        = '60\603a58221595cf66a4da1119dff7d42267574c45bd537479f1042387689ebe9d.png'
  'gem'         = 'd7\d72dd1937b75d900b1d7e095b5ccf8c5e94a3cbaa679ec8999536f9f86550a80.png'
  'heal'        = 'a8\a83a36315c439126ea1473d72afaf58e1d6e47f6e4d8053bacf90c5202b24b58.png'
  'pickShotgun' = '57\57393da729c783d05cb1825e97e5686481671a3a4344bc4cbf149a8ac3c4c850.png'
  'pickRifle'   = 'e5\e51a1603ebbf6abeee611c3429e332564b8d1296f4417315ee7134a498e815ea.png'
  'rock'        = '76\76d4fe58759e121507a2da0b183893d7f60f5c89499306b7005365afc82f0cb2.png'
  'blood'       = '1a\1ab2ebe81e0a4a3bd7900e323a8743b51a045bedb6d5e39bf270705b2b66f5de.png'
  'flash'       = 'f9\f9ef4b6ff17c94ab92562b06756693695d7be4ac0f325664fee82da9bc9db98e.png'
}
foreach ($name in $map.Keys) {
  $in = Join-Path $src $map[$name]
  $out = Join-Path $dst ($name + '.png')
  [Keyer]::Process($in, $out, 30, 256)
  Write-Output "$name done"
}
Write-Output 'ALL DONE'
