# Liste les fenêtres visibles de Windows (de la plus en avant à la plus en arrière), environ 3 fois par seconde.
# Lancé par main.js : chaque ligne écrite est un tableau JSON [[id, gauche, haut, droite, bas], ...] en pixels réels.
# Les fenêtres de ThomasGotchi lui-même (processus $env:TG_PID) sont ignorées.

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;

public static class TgWindows {
  delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr p);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out Rect r, int s);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int s);
  public struct Rect { public int L, T, R, B; }

  public static string List(uint skipPid) {
    var sb = new StringBuilder("[");
    bool first = true;
    EnumWindows((h, p) => {
      if (!IsWindowVisible(h) || IsIconic(h) || GetWindowTextLength(h) == 0) return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (pid == skipPid) return true;
      if ((GetWindowLong(h, -20) & 0x80) != 0) return true;            // fenêtres outils
      var cls = new StringBuilder(64); GetClassName(h, cls, 64);
      string c = cls.ToString();
      if (c == "Progman" || c == "WorkerW" || c == "Shell_TrayWnd") return true; // bureau, barre des tâches
      int cloaked;
      if (DwmGetWindowAttribute(h, 14, out cloaked, 4) == 0 && cloaked != 0) return true; // fenêtres masquées
      Rect r;
      if (DwmGetWindowAttribute(h, 9, out r, 16) != 0) return true;   // vrai contour, sans les bordures invisibles
      if (r.R - r.L < 100 || r.B - r.T < 50) return true;
      if (!first) sb.Append(',');
      first = false;
      sb.Append('[').Append(h.ToInt64()).Append(',').Append(r.L).Append(',').Append(r.T).Append(',').Append(r.R).Append(',').Append(r.B).Append(']');
      return true;
    }, IntPtr.Zero);
    return sb.Append(']').ToString();
  }
}
"@

# Musique en cours (Spotify, navigateur, lecteur Windows…) : une ligne « M1 » ou « M0 » quand ça change.
# Si cette partie ne marche pas sur ce Windows, on s'en passe (les fenêtres restent suivies).
$media = $null
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
  $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
  $task = $asTask.MakeGenericMethod([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]).Invoke($null, @([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()))
  if ($task.Wait(5000)) { $media = $task.Result }
} catch { $media = $null }
$playing = ''
$tick = 0

$skip = [uint32]$env:TG_PID
while ($true) {
  [Console]::Out.WriteLine([TgWindows]::List($skip))
  if ($media -and ($tick++ % 5 -eq 0)) {
    $now = 'M0'
    try { foreach ($s in $media.GetSessions()) { if ($s.GetPlaybackInfo().PlaybackStatus -eq 'Playing') { $now = 'M1' } } } catch { }
    if ($now -ne $playing) { $playing = $now; [Console]::Out.WriteLine($now) }
  }
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds 300
}
