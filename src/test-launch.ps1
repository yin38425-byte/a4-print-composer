param([Parameter(Mandatory=$true)][string]$Executable)
$ErrorActionPreference='Stop'
$startInfo=New-Object System.Diagnostics.ProcessStartInfo
$startInfo.FileName=(Resolve-Path -LiteralPath $Executable).Path
$startInfo.Arguments='--headless'
$startInfo.UseShellExecute=$false
$startInfo.CreateNoWindow=$true
$startInfo.RedirectStandardError=$true
$process=[Diagnostics.Process]::Start($startInfo)
$runtimeFile=Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) ('LocalLayout\session-'+$process.Id+'.txt')
try {
    for($attempt=0;$attempt -lt 40;$attempt++) {
        if($process.HasExited){throw ('启动器退出，退出码：'+$process.ExitCode+' '+$process.StandardError.ReadToEnd())}
        if(Test-Path -LiteralPath $runtimeFile){break}
        Start-Sleep -Milliseconds 250
    }
    if(!(Test-Path -LiteralPath $runtimeFile)){throw '启动失败：当前用户目录没有生成会话地址'}
    $url=(Get-Content -LiteralPath $runtimeFile -Raw).Trim()
    $health=Invoke-WebRequest -Uri ($url+'health') -UseBasicParsing -TimeoutSec 5
    $page=Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
    if($health.StatusCode -ne 200 -or $page.StatusCode -ne 200 -or $page.Content -notmatch 'DOCX|Word'){throw '页面或服务检查失败'}
    [pscustomobject]@{Passed=$true;ProcessId=$process.Id;RuntimeFile=$runtimeFile;Health=$health.StatusCode;Page=$page.StatusCode;InstallFolderSessionCreated=(Test-Path -LiteralPath (Join-Path (Split-Path $Executable) 'session-url.txt'))} | ConvertTo-Json
} finally {
    if(!$process.HasExited){$process.Kill();$process.WaitForExit()}
    $process.Dispose()
    if(Test-Path -LiteralPath $runtimeFile){Remove-Item -LiteralPath $runtimeFile -Force}
}
