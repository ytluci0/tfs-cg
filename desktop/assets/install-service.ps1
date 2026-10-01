param([Parameter(Mandatory=$true)][string]$ApplicationDirectory,[Parameter(Mandatory=$true)][string]$ServerDirectory)
$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $identity.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Run this installer in an administrator PowerShell window.' }
$application = (Resolve-Path -LiteralPath $ApplicationDirectory).Path
$sourceData = (Resolve-Path -LiteralPath $ServerDirectory).Path
if (-not (Test-Path -LiteralPath (Join-Path $application 'BroadcastCG.exe')) -or -not (Test-Path -LiteralPath (Join-Path $sourceData 'server.json'))) { throw 'Choose the installed BroadcastCG application and a provisioned server folder.' }
if (Test-Path -LiteralPath (Join-Path $sourceData 'server.lock')) { throw 'Stop the user host before installing the Windows service.' }
if (Get-Service -Name BroadcastCGProduction -ErrorAction SilentlyContinue) { throw 'The service already exists. Stop and back up the existing installation before upgrading it.' }
$target = [IO.Path]::GetFullPath((Join-Path $env:ProgramFiles 'BroadcastCGProduction'))
$data = [IO.Path]::GetFullPath((Join-Path $env:ProgramData 'BroadcastCG\Production'))
if ($target -ne (Join-Path $env:ProgramFiles 'BroadcastCGProduction') -or $data -ne (Join-Path $env:ProgramData 'BroadcastCG\Production')) { throw 'Unexpected destination.' }
if ((Test-Path -LiteralPath $target) -or (Test-Path -LiteralPath $data)) { throw 'Installation destinations must be new; no existing files will be replaced.' }
New-Item -ItemType Directory -Path $target,$data | Out-Null
& icacls.exe $target /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-19:(OI)(CI)RX'
if ($LASTEXITCODE -ne 0) { throw 'Could not protect the service executable folder.' }
& icacls.exe $data /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-19:(OI)(CI)M'
if ($LASTEXITCODE -ne 0) { throw 'Could not protect the service data folder.' }
Get-ChildItem -LiteralPath $application | Copy-Item -Destination $target -Recurse
Get-ChildItem -LiteralPath $sourceData | Copy-Item -Destination $data -Recurse
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'BroadcastCGHost.exe') -Destination (Join-Path $target 'BroadcastCGHost.exe')
# LocalService gets no interactive account credentials and no administrator rights.
& sc.exe create BroadcastCGProduction binPath= ('"' + (Join-Path $target 'BroadcastCGHost.exe') + '"') start= delayed-auto obj= 'NT AUTHORITY\LocalService' DisplayName= 'BroadcastCG Production'
if ($LASTEXITCODE -ne 0) { throw 'Windows service registration failed.' }
& sc.exe description BroadcastCGProduction 'Self-hosted graphics authority. Restart never resumes production commands.'
& sc.exe failure BroadcastCGProduction reset= 86400 actions= restart/10000/restart/30000/none/0
Start-Service -Name BroadcastCGProduction
Write-Output 'BroadcastCG Production installed under LocalService. Test its HTTPS connection before use. No firewall rule was opened automatically.'
