param(
  [Parameter(Mandatory = $true)]
  [string]$Theme
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $repoRoot "assets\themes\$Theme\app-icon.png"
$iconDirectory = Join-Path $repoRoot "assets\icons"

if (-not (Test-Path -LiteralPath $sourcePath)) {
  throw "Theme icon not found: $sourcePath"
}

Add-Type -AssemblyName System.Drawing
Copy-Item -LiteralPath $sourcePath -Destination (Join-Path $iconDirectory "cinema-note-icon-source.png") -Force

$source = [System.Drawing.Image]::FromFile($sourcePath)
$targets = @{
  "icon-512.png" = 512
  "icon-192.png" = 192
  "apple-touch-icon.png" = 180
  "favicon-32.png" = 32
  "favicon-16.png" = 16
}

try {
  foreach ($target in $targets.GetEnumerator()) {
    $size = [int]$target.Value
    $bitmap = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)

    try {
      $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.DrawImage($source, 0, 0, $size, $size)
      $bitmap.Save((Join-Path $iconDirectory $target.Key), [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
      $graphics.Dispose()
      $bitmap.Dispose()
    }
  }
}
finally {
  $source.Dispose()
}

Write-Output "Generated app icons from the '$Theme' theme."
