param(
    [string]$Sdk = $env:ANDROID_HOME,
    [string]$Jdk = $env:JAVA_HOME,
    [string]$BuildTools = '36.1.0'
)

$ErrorActionPreference = 'Stop'
if (!$Sdk) { $Sdk = $env:ANDROID_SDK_ROOT }
if (!$Sdk) { $Sdk = Join-Path $env:LOCALAPPDATA 'Android/Sdk' }
if (!$Jdk) {
    $compiler = Get-Command javac -ErrorAction SilentlyContinue
    if ($compiler) { $Jdk = Split-Path (Split-Path $compiler.Source) }
}
if (!$Jdk) { throw 'Configura JAVA_HOME o pasa -Jdk con la ruta de un JDK 17 o posterior.' }

$project = Split-Path $PSScriptRoot
$tools = Join-Path $Sdk "build-tools/$BuildTools"
$platform = Join-Path $Sdk 'platforms/android-36/android.jar'
$java = Join-Path $Jdk 'bin/java.exe'
$javac = Join-Path $Jdk 'bin/javac.exe'
$jar = Join-Path $Jdk 'bin/jar.exe'
$keytool = Join-Path $Jdk 'bin/keytool.exe'
foreach ($required in @($platform, $java, $javac, $jar, $keytool, "$tools/aapt2.exe", "$tools/zipalign.exe", "$tools/lib/d8.jar", "$tools/lib/apksigner.jar")) {
    if (!(Test-Path -LiteralPath $required -PathType Leaf)) { throw "Herramienta no encontrada: $required" }
}

function Invoke-BuildTool([string]$Tool, [string[]]$ToolArgs) {
    & $Tool @ToolArgs
    if ($LASTEXITCODE -ne 0) { throw "Falló $Tool con código $LASTEXITCODE." }
}

$buildRoot = Join-Path $PSScriptRoot '.build'
$work = Join-Path $buildRoot ([guid]::NewGuid().ToString('N'))
$signing = Join-Path $PSScriptRoot '.signing'
$dist = Join-Path $project 'dist'
New-Item -ItemType Directory -Force -Path "$work/assets","$work/classes","$work/dex",$signing,$dist | Out-Null
try {
    Copy-Item -LiteralPath "$project/index.html","$project/css","$project/js" -Destination "$work/assets" -Recurse
    Invoke-BuildTool "$tools/aapt2.exe" @('compile', '--dir', "$PSScriptRoot/res", '-o', "$work/res.zip")
    Invoke-BuildTool "$tools/aapt2.exe" @('link', '-I', $platform, '--manifest', "$PSScriptRoot/AndroidManifest.xml",
        '-o', "$work/unsigned.apk", "$work/res.zip")

    $sources = @(Get-ChildItem -LiteralPath "$PSScriptRoot/src" -Recurse -Filter '*.java' | ForEach-Object FullName)
    Invoke-BuildTool $javac (@('--release', '8', '-encoding', 'UTF-8', '-cp', $platform, '-d', "$work/classes") + $sources)
    Invoke-BuildTool $jar @('cf', "$work/classes.jar", '-C', "$work/classes", '.')
    Invoke-BuildTool $java @('-cp', "$tools/lib/d8.jar", 'com.android.tools.r8.D8', '--release', '--min-api', '26',
        '--lib', $platform, '--output', "$work/dex", "$work/classes.jar")
    # jar normalizes asset entry paths to forward slashes on Windows.
    Invoke-BuildTool $jar @('uf', "$work/unsigned.apk", '-C', $work, 'assets', '-C', "$work/dex", 'classes.dex')
    Invoke-BuildTool "$tools/zipalign.exe" @('-p', '-f', '4', "$work/unsigned.apk", "$work/aligned.apk")

    $key = Join-Path $signing 'hoja-de-calculo.p12'
    $secret = Join-Path $signing 'password.txt'
    if (!(Test-Path -LiteralPath $key)) {
        $env:HC_APK_KEY_PASSWORD = [guid]::NewGuid().ToString('N')
        Set-Content -LiteralPath $secret -Value $env:HC_APK_KEY_PASSWORD -Encoding ascii
        Invoke-BuildTool $keytool @('-genkeypair', '-storetype', 'PKCS12', '-keystore', $key,
            '-alias', 'hoja-de-calculo', '-storepass:env', 'HC_APK_KEY_PASSWORD', '-keyalg', 'RSA',
            '-keysize', '3072', '-validity', '10000', '-dname', 'CN=Hoja de calculo')
    } else {
        $env:HC_APK_KEY_PASSWORD = (Get-Content -LiteralPath $secret -Raw).Trim()
    }

    Invoke-BuildTool $java @('-jar', "$tools/lib/apksigner.jar", 'sign', '--ks', $key,
        '--ks-key-alias', 'hoja-de-calculo', '--ks-pass', 'env:HC_APK_KEY_PASSWORD',
        '--out', "$work/Hoja-de-calculo.apk", "$work/aligned.apk")
    Invoke-BuildTool $java @('-jar', "$tools/lib/apksigner.jar", 'verify', '--verbose', "$work/Hoja-de-calculo.apk")
    Copy-Item -LiteralPath "$work/Hoja-de-calculo.apk" -Destination $dist -Force
    Write-Host "APK: $dist/Hoja-de-calculo.apk"
} finally {
    Remove-Item Env:HC_APK_KEY_PASSWORD -ErrorAction SilentlyContinue
    $resolvedWork = (Resolve-Path -LiteralPath $work).Path
    $resolvedRoot = (Resolve-Path -LiteralPath $buildRoot).Path
    if ($resolvedWork.StartsWith($resolvedRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        Remove-Item -LiteralPath $resolvedWork -Recurse -Force
    }
}

