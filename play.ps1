# BURNOUT: You Are the Semester - local launcher.
# Serves this folder on http://localhost (browsers won't load the game's models from a plain
# file), then opens the game in your default browser. Close this window to stop.

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$types = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json'; '.glb' = 'model/gltf-binary'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'
  '.jpeg' = 'image/jpeg'; '.webp' = 'image/webp'; '.svg' = 'image/svg+xml'; '.mp3' = 'audio/mpeg'
  '.ogg' = 'audio/ogg'; '.wav' = 'audio/wav'; '.woff2' = 'font/woff2'; '.ico' = 'image/x-icon'
}

# the first free port from 8765 up
$listener = $null
foreach ($port in 8765..8785) {
  try {
    $l = New-Object System.Net.HttpListener
    $l.Prefixes.Add("http://localhost:$port/")
    $l.Start()
    $listener = $l
    break
  } catch { }
}
if (-not $listener) { Write-Host 'Could not open a local port (8765-8785).'; Read-Host 'Press Enter to close'; exit 1 }

$url = $listener.Prefixes | Select-Object -First 1
Write-Host ''
Write-Host '  BURNOUT: You Are the Semester' -ForegroundColor Yellow
Write-Host "  Running at $url"
Write-Host '  The game opens in your browser. Keep this window open while you play; close it to stop.'
Write-Host ''
Start-Process $url

while ($listener.IsListening) {
  try { $ctx = $listener.GetContext() } catch { break }
  $res = $ctx.Response
  try {
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
    if ($path -eq '') { $path = 'index.html' }
    $file = [System.IO.Path]::GetFullPath((Join-Path $root $path))
    # only files inside this folder
    if ($file.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $file -PathType Leaf)) {
      $ext = [System.IO.Path]::GetExtension($file).ToLower()
      $res.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
      $bytes = [System.IO.File]::ReadAllBytes($file)
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
    }
  } catch { $res.StatusCode = 500 }
  finally { $res.Close() }
}
