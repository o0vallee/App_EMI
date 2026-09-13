$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:8790/")
$listener.Start()
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Write-Host "Serving $root on http://localhost:8790/"
while ($listener.IsListening) {
    $context = $listener.GetContext()
    $req = $context.Request
    $res = $context.Response
    $path = $req.Url.LocalPath
    if ($path -eq "/") { $path = "/index.html" }
    $filePath = Join-Path $root ($path.TrimStart("/"))
    if (Test-Path $filePath -PathType Leaf) {
        $bytes = [System.IO.File]::ReadAllBytes($filePath)
        $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
        $ct = switch ($ext) {
            ".html" { "text/html" }
            ".js"   { "application/javascript" }
            ".css"  { "text/css" }
            ".m4a"  { "audio/mp4" }
            default { "application/octet-stream" }
        }
        $res.ContentType = $ct
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
        $res.StatusCode = 404
    }
    $res.OutputStream.Close()
}
