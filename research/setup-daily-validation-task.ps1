param([switch]$Remove)
$ErrorActionPreference='Stop'
$taskName='ChariNeko Daily Validation'
if($Remove){Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue;return}
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$node=(Get-Command node -ErrorAction Stop).Source
$script=Join-Path $PSScriptRoot 'daily-validation-run.mjs'
$action=New-ScheduledTaskAction -Execute $node -Argument ('"'+$script+'"') -WorkingDirectory $repo
$trigger=New-ScheduledTaskTrigger -Daily -At '06:30'
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2)
$principal=New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Research-only daily validation; no production writes or tuning.' -Force | Out-Null
Get-ScheduledTask -TaskName $taskName | Select-Object TaskName,State,@{n='StartWhenAvailable';e={$_.Settings.StartWhenAvailable}},@{n='MultipleInstances';e={$_.Settings.MultipleInstances}}
