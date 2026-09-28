$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$projectPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$archivePath = Join-Path ([System.IO.Path]::GetDirectoryName($projectPath)) 'clearpath-phase-9-source.zip'
$archiveStream = [System.IO.File]::Open($archivePath, [System.IO.FileMode]::Create)
$archive = [System.IO.Compression.ZipArchive]::new($archiveStream, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  $files = [System.IO.Directory]::EnumerateFiles($projectPath, '*', [System.IO.SearchOption]::AllDirectories)
  $count = 0
  foreach ($file in $files) {
    $relative = [System.IO.Path]::GetRelativePath($projectPath, $file).Replace('\', '/')
    if ($relative -match '^(node_modules|\.next|\.git|\.local|coverage)/') { continue }
    if ($relative -match '(^|/)\.env' -and $relative -ne '.env.example') { continue }
    if ($relative -match '(\.tsbuildinfo|\.log)$' -or $relative -eq 'next-env.d.ts') { continue }
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file, ('clearpath/' + $relative), [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    $count++
  }
} finally { $archive.Dispose(); $archiveStream.Dispose() }
$check = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
try {
  $unsafe = $check.Entries | Where-Object { $_.FullName -match '/(node_modules|\.next|\.git|\.local)/' -or ($_.FullName -match '/\.env' -and $_.FullName -ne 'clearpath/.env.example') }
  if ($unsafe) { throw 'Archive contains an excluded path.' }
  Write-Output "Source archive verified: $count files; no dependencies, build output, or local environment files."
} finally { $check.Dispose() }
