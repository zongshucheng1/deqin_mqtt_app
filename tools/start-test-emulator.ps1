param(
    [string]$Sdk='C:\Users\deqin\AppData\Local\Android\Sdk',
    [int]$Port=5588,
    [ValidateSet(30,37)][int]$AndroidApi=30,
    [switch]$Headless
)
$ErrorActionPreference='Stop'
$workspace=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$emulator=Join-Path $Sdk 'emulator/emulator.exe'
$imageRelative=if($AndroidApi -eq 30){'system-images/android-30/google_apis/x86'}else{'system-images/android-37.0/google_apis_playstore/x86_64'}
$image=Join-Path $Sdk $imageRelative
$abi=if($AndroidApi -eq 30){'x86'}else{'x86_64'}
$imageTarget=if($AndroidApi -eq 30){'android-30'}else{'android-37.0'}
$imageTag=if($AndroidApi -eq 30){'google_apis'}else{'google_apis_playstore'}
$memoryMb=if($AndroidApi -eq 30){2048}else{4096}
$avdName="Inout_Studio_API$AndroidApi"
if(!(Test-Path -LiteralPath $emulator) -or !(Test-Path -LiteralPath (Join-Path $image 'system.img'))){throw 'Android emulator or selected installed image not found'}
if($Port -lt 5554 -or $Port -gt 5682 -or $Port%2){throw 'Use an even emulator console port in 5554..5682'}
if(Get-NetTCPConnection -LocalPort $Port,($Port+1) -ErrorAction SilentlyContinue | Where-Object {$_.State.ToString() -in @('Listen','Bound')}){throw 'The selected emulator ports are in use'}
& $emulator -accel-check
if($LASTEXITCODE -ne 0){throw 'A usable hypervisor is required; no Windows features are changed by this tool'}
$run=Join-Path $workspace ('implementation/.runtime/studio-emulator-'+[Guid]::NewGuid().ToString('N').Substring(0,12))
$avdHome=Join-Path $run 'avd'
$avd=Join-Path $avdHome ($avdName+'.avd')
New-Item -ItemType Directory -Path $avd -Force | Out-Null
$utf8=[Text.UTF8Encoding]::new($false)
$config=@"
AvdId=$avdName
avd.ini.displayname=Inout independent Android Studio test
abi.type=$abi
hw.cpu.arch=$abi
hw.cpu.ncore=2
hw.ramSize=$memoryMb
hw.lcd.width=600
hw.lcd.height=960
hw.lcd.density=240
hw.keyboard=yes
hw.gpu.enabled=yes
hw.gpu.mode=swiftshader
hw.sdCard=no
hw.camera.back=none
hw.camera.front=none
disk.dataPartition.size=6442450944
image.sysdir.1=$image\
tag.id=$imageTag
tag.display=Google APIs
PlayStore.enabled=false
fastboot.forceColdBoot=yes
"@
[IO.File]::WriteAllText((Join-Path $avd 'config.ini'),$config,$utf8)
[IO.File]::WriteAllText((Join-Path $avdHome ($avdName+'.ini')),"avd.ini.encoding=UTF-8`npath=$avd`ntarget=$imageTarget`n",$utf8)
$env:ANDROID_AVD_HOME=$avdHome
# This is an interactive emulator requested by the user. Its data is task-owned.
$arguments=@('-avd',$avdName,'-port',"$Port",'-accel','on','-gpu','swiftshader','-no-snapshot','-no-boot-anim','-no-audio','-no-metrics','-feature','-Vulkan')
if($Headless){$arguments+='-no-window'}
$windowStyle=if($Headless){'Hidden'}else{'Normal'}
$process=Start-Process -FilePath $emulator -ArgumentList $arguments -WindowStyle $windowStyle -PassThru -RedirectStandardOutput (Join-Path $run 'emulator.stdout.log') -RedirectStandardError (Join-Path $run 'emulator.stderr.log')
$result=[ordered]@{startedAt=[DateTime]::UtcNow.ToString('o');run=$run;avdHome=$avdHome;avd=$avdName;pid=$process.Id;serial="emulator-$Port";image=$image;api=$AndroidApi;abi=$abi;existingAvdDataUsed=$false;windowsFeaturesChanged=$false}
$result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $run 'launch.json') -Encoding utf8
$result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $workspace 'implementation/android-studio-emulator-launch.json') -Encoding utf8
Write-Output "Emulator started, PID=$($process.Id), serial=emulator-$Port, logs=$run"
# The launcher can exit after spawning QEMU. Track its task-owned child as well.
$child=$null
for($attempt=0;$attempt -lt 20;$attempt++){
    $child=Get-CimInstance Win32_Process -Filter "Name='qemu-system-x86_64.exe' OR Name='qemu-system-i386.exe'" | Where-Object {$_.ParentProcessId -eq $process.Id} | Select-Object -First 1
    if($child){break}
    if(!$process.HasExited){Start-Sleep -Milliseconds 500;continue}
    Start-Sleep -Milliseconds 500
}
if($child){
    $result['qemuPid']=$child.ProcessId
    $result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $run 'launch.json') -Encoding utf8
    $result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $workspace 'implementation/android-studio-emulator-launch.json') -Encoding utf8
    Write-Output "QEMU child running, PID=$($child.ProcessId)"
    Wait-Process -Id $child.ProcessId -ErrorAction SilentlyContinue
}elseif(!$process.HasExited){Wait-Process -Id $process.Id}
$process.Refresh()
Write-Output "Emulator launcher/child reached terminal state; launcher exit=$($process.ExitCode)."
