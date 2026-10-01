# Run on the recipient PC from an elevated Windows PowerShell session.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Configuration)
$ErrorActionPreference='Stop'
$principal=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if(-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Run this setup script as a Windows administrator on the recipient PC.'}
$source=(Resolve-Path -LiteralPath $Configuration).Path
if((Get-Item -LiteralPath $source).Length -gt 32000){throw 'Configuration is too large.'}
$policy=Get-Content -LiteralPath $source -Raw | ConvertFrom-Json
if($policy.format -ne 'broadcastcg-managed-client' -or $policy.version -ne 1 -or @($policy.profiles).Count -lt 1 -or @($policy.profiles).Count -gt 4){throw 'Invalid BroadcastCG managed-client configuration.'}
foreach($profile in $policy.profiles){
 $uri=[Uri]$profile.url
 if(-not $uri.IsAbsoluteUri -or $uri.Scheme -ne 'https' -or $uri.UserInfo -or $uri.AbsolutePath -ne '/' -or $uri.Query -or $uri.Fragment -or $profile.fingerprint -notmatch '^[a-fA-F0-9]{64}$' -or -not $profile.name){throw 'Invalid production server address or certificate fingerprint.'}
}
$directory=Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'BroadcastCG'
New-Item -ItemType Directory -Path $directory -Force | Out-Null
if((Get-Item -LiteralPath $directory).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'The managed policy folder cannot be a junction or symbolic link.'}
$administrators=New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')
$system=New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
$users=New-Object Security.Principal.SecurityIdentifier('S-1-5-32-545')
$acl=New-Object Security.AccessControl.DirectorySecurity
$acl.SetOwner($administrators)
$acl.SetAccessRuleProtection($true,$false)
foreach($sid in @($administrators,$system)){$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')))}
$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($users,'ReadAndExecute','ContainerInherit,ObjectInherit','None','Allow')))
Set-Acl -LiteralPath $directory -AclObject $acl
$target=Join-Path $directory 'managed-client.json'
if(Test-Path -LiteralPath $target){if((Get-Item -LiteralPath $target).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'The policy file cannot be a symbolic link.'};Copy-Item -LiteralPath $target -Destination ($target+'.previous-'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss'))}
$temporary=Join-Path $directory ('policy-'+[Guid]::NewGuid().ToString()+'.tmp')
[IO.File]::WriteAllText($temporary,($policy | ConvertTo-Json -Depth 10),(New-Object Text.UTF8Encoding($false)))
Move-Item -LiteralPath $temporary -Destination $target -Force
$fileAcl=New-Object Security.AccessControl.FileSecurity
$fileAcl.SetOwner($administrators)
$fileAcl.SetAccessRuleProtection($true,$false)
foreach($sid in @($administrators,$system)){$fileAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','Allow')))}
$fileAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($users,'ReadAndExecute','Allow')))
Set-Acl -LiteralPath $target -AclObject $fileAcl
Write-Output 'Managed mode configured. Restart BroadcastCG and sign in with the account supplied by your administrator. No local-mode fallback is available.'
