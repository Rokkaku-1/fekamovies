# Renderizador para el SVG simple de texto incluido. Ejecutar con Windows PowerShell.
# No requiere paquetes externos. Conserva el fondo completo y el área segura maskable.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
[xml]$logoDocument = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'logo.svg') -Raw
$logoText = $logoDocument.svg.text.InnerText
$backgroundColor = [System.Drawing.ColorTranslator]::FromHtml($logoDocument.svg.rect.fill)
$foregroundColor = [System.Drawing.ColorTranslator]::FromHtml($logoDocument.svg.text.fill)
$sizes = @{'icon-192.png'=192; 'icon-512.png'=512; 'icon-maskable.png'=512; 'apple-touch-icon.png'=180}
foreach ($entry in $sizes.GetEnumerator()) {
  $size = [int]$entry.Value
  $bitmap = [System.Drawing.Bitmap]::new($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $fontSize = [single]([double]$logoDocument.svg.text.'font-size' * $size / 512)
  $font = [System.Drawing.Font]::new('Arial', $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $brush = [System.Drawing.SolidBrush]::new($foregroundColor)
  $format = [System.Drawing.StringFormat]::new()
  try {
    $graphics.Clear($backgroundColor)
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $graphics.DrawString($logoText, $font, $brush, [System.Drawing.RectangleF]::new(0, 0, $size, $size), $format)
    $bitmap.Save((Join-Path $PSScriptRoot $entry.Key), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $format.Dispose(); $brush.Dispose(); $font.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
  }
}
