<#
.SYNOPSIS
  Updates an unpacked Form History extension to the latest version on GitHub.

.DESCRIPTION
  Downloads the repository from GitHub, and replaces the files in your extension folder with the
  new ones. Your list is not in that folder (it lives in the browser and in Google Drive), so
  nothing is lost. Afterwards, click the reload arrow on Form History's card in chrome://extensions
  (and edge://extensions): browsers do not pick up new files on their own.

  Works in Windows PowerShell 5.1 and PowerShell 7.

.PARAMETER Target
  The folder you chose with "Load unpacked". It is created if missing. A folder that holds
  anything other than Form History is left alone.

.PARAMETER Branch
  The branch to install. Default: main.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File update.ps1
  powershell -ExecutionPolicy Bypass -File update.ps1 -Target "C:\Users\me\Downloads\form-history"
#>
param(
  [string]$Target = (Join-Path $env:USERPROFILE 'form-history'),
  [string]$Branch = 'main'
)

$ErrorActionPreference = 'Stop'
$Repo = 'allenwilk007-source/gform-log'
$Name = 'Form History'

function Read-Manifest([string]$Folder) {
  $path = Join-Path $Folder 'manifest.json'
  if (-not (Test-Path -LiteralPath $path)) { return $null }
  try { return Get-Content -LiteralPath $path -Raw | ConvertFrom-Json } catch { return $null }
}

# Refuse to empty a folder that is not a Form History extension.
$Target = [System.IO.Path]::GetFullPath($Target)
$before = $null
if (Test-Path -LiteralPath $Target) {
  $before = Read-Manifest $Target
  $hasFiles = @(Get-ChildItem -LiteralPath $Target -Force).Count -gt 0
  if ($hasFiles -and ($null -eq $before -or $before.name -ne $Name)) {
    throw "$Target is not a $Name extension folder (no manifest.json for $Name at its top). Pass the folder you chose with Load unpacked: -Target <folder>"
  }
}

# Windows PowerShell 5.1 may not offer TLS 1.2 to GitHub unless asked.
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$work = Join-Path ([System.IO.Path]::GetTempPath()) ("form-history-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
try {
  $zip = Join-Path $work 'repo.zip'
  $url = "https://codeload.github.com/$Repo/zip/refs/heads/$Branch"
  Write-Host "Downloading $Branch from github.com/$Repo ..."
  try {
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
  } catch {
    throw "Could not download $url. Check the branch name and your connection. $($_.Exception.Message)"
  }
  Expand-Archive -LiteralPath $zip -DestinationPath (Join-Path $work 'repo')

  # The archive holds one top folder (gform-log-<branch>); the extension is its extension folder.
  $source = Get-ChildItem -Path (Join-Path $work 'repo') -Directory |
    ForEach-Object { Join-Path $_.FullName 'extension' } |
    Where-Object { Test-Path -LiteralPath (Join-Path $_ 'manifest.json') } |
    Select-Object -First 1
  $after = if ($source) { Read-Manifest $source } else { $null }
  if ($null -eq $after -or $after.name -ne $Name) { throw "The download has no $Name extension in it." }

  if ($before -and ([version]$after.version -lt [version]$before.version)) {
    Write-Warning "This installs $($after.version), older than the $($before.version) you have. Newer versions may be on another branch: -Branch <name>"
  }

  # Replace everything, so files removed upstream do not linger.
  if (Test-Path -LiteralPath $Target) {
    Get-ChildItem -LiteralPath $Target -Force | Remove-Item -Recurse -Force
  } else {
    New-Item -ItemType Directory -Path $Target | Out-Null
  }
  Copy-Item -Path (Join-Path $source '*') -Destination $Target -Recurse -Force

  $from = if ($before) { $before.version } else { 'nothing' }
  Write-Host ""
  Write-Host "Form History $from -> $($after.version), in $Target" -ForegroundColor Green
  if ($null -eq $before) {
    Write-Host "First install here: open chrome://extensions, turn on Developer mode, click Load unpacked and choose that folder."
  } else {
    Write-Host "Now click the reload arrow on Form History's card in chrome://extensions, and in edge://extensions if you use Edge."
  }
} finally {
  Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}
