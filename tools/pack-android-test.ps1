param(
    [string]$HBuilderCli='D:\Development\HBuilderX\cli.exe',
    [string]$PackageName='com.deqin.inout',
    [switch]$CompileOnly,
    [switch]$Status,
    [switch]$Submit,
    [switch]$CustomBase,
    [switch]$InternalUsb,
    [switch]$LocalService,
    [string]$NodeExecutable='D:\Development\nodejs\node.exe'
)
$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if(!(Test-Path -LiteralPath $HBuilderCli)){throw '未找到HBuilderX CLI，请用-HBuilderCli指定安装路径'}
$manifest=Get-Content -LiteralPath (Join-Path $project 'src/manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if($manifest.appid -ne '__UNI__4275A0F'){throw '本工程必须使用用户确认的DCloud AppID __UNI__4275A0F'}
if($PackageName -notmatch '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$'){throw 'Android包名格式不正确'}
if(@($CompileOnly,$Status,$Submit | Where-Object {$_}).Count -gt 1){throw 'CompileOnly、Status、Submit不能同时使用'}
if($CustomBase -and !$Submit){throw 'CustomBase必须与Submit同时使用'}
if($InternalUsb -and !$Submit){throw 'InternalUsb必须与Submit同时使用；查询状态或UTS编译不能提交云包'}
if($LocalService -and (!$Submit -or $InternalUsb -or $CustomBase)){throw 'LocalService仅用于独立完整本地服务包，必须Submit且不能同时使用InternalUsb或CustomBase'}
if($Status){& $HBuilderCli pack status --project $project;exit $LASTEXITCODE}
if($CompileOnly){& $HBuilderCli compile app-android --project $project --uni_module deqin-host;exit $LASTEXITCODE}
if(!$Submit){
    Write-Output "已核对 AppID=$($manifest.appid)，Android包名=$PackageName。"
    Write-Output '使用-CompileOnly编译UTS插件；登录HBuilderX后用-Submit提交内部验收APK（应用云端证书）。'
    exit 0
}
if(!(Test-Path -LiteralPath $NodeExecutable)){throw '未找到Node.js，请用-NodeExecutable指定构建工具路径'}
if($LocalService){
    if($PackageName -ne 'com.deqin.inout.local' -or $manifest.name -notmatch '本地服务'){throw '本地服务必须使用独立包名com.deqin.inout.local并在应用名标明本地服务'}
    Push-Location $project
    try { & $NodeExecutable --import tsx (Join-Path $project 'tools/check-local-service.ts'); $localCheck=$LASTEXITCODE } finally { Pop-Location }
    if($localCheck -ne 0){throw '本地服务部署selector检查失败，禁止提交云端'}
    Write-Output '已选择独立本地服务完整安装包；仅连接显式配置的局域网后端。'
}elseif($InternalUsb){
    & $NodeExecutable (Join-Path $project 'tools/internal-usb-profile.cjs') --check
    if($LASTEXITCODE -ne 0){throw '内部USB部署selector检查失败，禁止提交云端'}
    Write-Output '已明确选择内部USB联调包，仅允许ADB reverse到127.0.0.1:8080，不得作为正式部署包发布。'
}else{
    & $NodeExecutable (Join-Path $project 'tools/production-build.cjs') --check
    if($LASTEXITCODE -ne 0){throw '正式部署配置检查失败，禁止提交云端'}
}
# An installable internal acceptance package using the app owner's DCloud certificate.
# New apps no longer support androidpacktype=1 (the old public test certificate).
# No account password, signing password or production credential is passed by this script.
$packageSafeMode='true'
$packageCustomBase='false'
if($CustomBase){
    # Official custom debug bases do not support safe packaging.
    $packageSafeMode='false'
    $packageCustomBase='true'
}
& $HBuilderCli pack --project $project --platform android --safemode $packageSafeMode --iscustom $packageCustomBase `
    --android.packagename $PackageName --android.androidpacktype 3 `
    --splashads false --rpads false --unimpads false --sourceMap false --ignoreWarnings true
exit $LASTEXITCODE
