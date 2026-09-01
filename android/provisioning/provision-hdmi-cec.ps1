[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$Serial,

    [string]$ApkPath = (
        Join-Path $PSScriptRoot '..\app\build\outputs\apk\release\app-release.apk'
    )
)

$ErrorActionPreference = 'Stop'

$packageName = 'com.indoorplayer'
$remoteAppDirectory = '/system/priv-app/IndoorPlayer'
$remoteApkPath = "$remoteAppDirectory/IndoorPlayer.apk"
$remotePermissionsPath = '/system/etc/permissions/privapp-permissions-com.indoorplayer.xml'
$temporaryApkPath = '/data/local/tmp/IndoorPlayer.apk'
$temporaryPermissionsPath = '/data/local/tmp/privapp-permissions-com.indoorplayer.xml'
$permissionsFile = Join-Path $PSScriptRoot 'privapp-permissions-com.indoorplayer.xml'
$backupRoot = Join-Path $PSScriptRoot 'backups'

function Resolve-AdbPath {
    $candidates = @()

    if ($env:ANDROID_HOME) {
        $candidates += Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe'
    }

    if ($env:ANDROID_SDK_ROOT) {
        $candidates += Join-Path $env:ANDROID_SDK_ROOT 'platform-tools\adb.exe'
    }

    if ($env:LOCALAPPDATA) {
        $candidates += Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
    }

    $adbCommand = Get-Command 'adb.exe' -ErrorAction SilentlyContinue

    if ($adbCommand) {
        $candidates += $adbCommand.Source
    }

    $resolved = $candidates |
        Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } |
        Select-Object -First 1

    if (-not $resolved) {
        throw 'adb.exe não foi encontrado. Configure ANDROID_HOME ou instale o Android SDK Platform Tools.'
    }

    return (Resolve-Path -LiteralPath $resolved).Path
}

function Invoke-Adb {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,

        [switch]$AllowFailure
    )

    # Windows PowerShell 5 converte qualquer texto escrito no stderr por um
    # executavel nativo em NativeCommandError quando ErrorActionPreference=Stop.
    # O ADB usa stderr para mensagens normais de progresso (push/pull), entao o
    # resultado deve ser decidido pelo exit code real do processo.
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'

    try {
        $output = & $script:adbPath -s $Serial @Arguments 2>&1
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    $output = @($output | ForEach-Object { $_.ToString() })

    if ($exitCode -ne 0 -and -not $AllowFailure) {
        throw "ADB falhou ($exitCode): $($output -join [Environment]::NewLine)"
    }

    return @($output)
}

function Assert-RootShell {
    $identity = (Invoke-Adb -Arguments @('shell', 'id')) -join ' '

    if ($identity -notmatch 'uid=0\(root\)') {
        throw 'Este provisionamento exige ADB com acesso root fornecido pelo fabricante do TV Box.'
    }
}

function Set-SystemMountMode {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet('rw', 'ro')]
        [string]$Mode
    )

    Invoke-Adb -Arguments @('shell', 'mount', '-o', "$Mode,remount", '/') | Out-Null
}

function Wait-DeviceBootComplete {
    $attempts = 30

    for ($attempt = 1; $attempt -le $attempts; $attempt++) {
        $bootCompleted = (
            Invoke-Adb -Arguments @('shell', 'getprop', 'sys.boot_completed') -AllowFailure
        ) -join ''

        if ($bootCompleted.Trim() -eq '1') {
            return
        }

        Start-Sleep -Seconds 2
    }

    throw 'O TV Box nao concluiu a inicializacao dentro do tempo esperado.'
}

$script:adbPath = Resolve-AdbPath
$resolvedApkPath = (Resolve-Path -LiteralPath $ApkPath).Path
$resolvedPermissionsFile = (Resolve-Path -LiteralPath $permissionsFile).Path
$deviceState = (Invoke-Adb -Arguments @('get-state')) -join ''

if ($deviceState.Trim() -ne 'device') {
    throw "O dispositivo $Serial não está conectado e autorizado no ADB."
}

Assert-RootShell

$model = ((Invoke-Adb -Arguments @('shell', 'getprop', 'ro.product.model')) -join '').Trim()
$androidVersion = ((Invoke-Adb -Arguments @('shell', 'getprop', 'ro.build.version.release')) -join '').Trim()
$cecService = (Invoke-Adb -Arguments @('shell', 'service', 'list')) -join "`n"

if ($cecService -notmatch 'hdmi_control') {
    throw "O dispositivo $model não expõe o serviço hdmi_control."
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDirectory = Join-Path $backupRoot "$Serial-$timestamp"

New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null

$currentPackagePath = (
    Invoke-Adb -Arguments @('shell', 'pm', 'path', $packageName) -AllowFailure
) -join "`n"

Set-Content -LiteralPath (Join-Path $backupDirectory 'device-info.txt') -Value @(
    "serial=$Serial"
    "model=$model"
    "android=$androidVersion"
    "packagePath=$currentPackagePath"
) -Encoding UTF8

$systemApkExists = (
    (Invoke-Adb -Arguments @('shell', 'test', '-f', $remoteApkPath, ';', 'echo', '$?')) -join ''
).Trim() -eq '0'

if ($systemApkExists) {
    Invoke-Adb -Arguments @('pull', $remoteApkPath, (Join-Path $backupDirectory 'IndoorPlayer.apk')) |
        Out-Null
}

$permissionsExist = (
    (
        Invoke-Adb -Arguments @(
            'shell',
            'test',
            '-f',
            $remotePermissionsPath,
            ';',
            'echo',
            '$?'
        )
    ) -join ''
).Trim() -eq '0'

if ($permissionsExist) {
    Invoke-Adb -Arguments @(
        'pull',
        $remotePermissionsPath,
        (Join-Path $backupDirectory 'privapp-permissions-com.indoorplayer.xml')
    ) | Out-Null
}

$apkHash = (Get-FileHash -LiteralPath $resolvedApkPath -Algorithm SHA256).Hash
Set-Content -LiteralPath (Join-Path $backupDirectory 'new-apk.sha256') -Value $apkHash -Encoding ASCII

if (-not $PSCmdlet.ShouldProcess(
    "$model ($Serial)",
    'Instalar o Indoor Player como app privilegiado com acesso HDMI-CEC e reiniciar o TV Box'
)) {
    return
}

Invoke-Adb -Arguments @('push', $resolvedApkPath, $temporaryApkPath) | Out-Null
Invoke-Adb -Arguments @('push', $resolvedPermissionsFile, $temporaryPermissionsPath) | Out-Null

Set-SystemMountMode -Mode 'rw'

try {
    Invoke-Adb -Arguments @('shell', 'mkdir', '-p', $remoteAppDirectory) | Out-Null
    Invoke-Adb -Arguments @('shell', 'cp', $temporaryApkPath, $remoteApkPath) | Out-Null
    Invoke-Adb -Arguments @('shell', 'cp', $temporaryPermissionsPath, $remotePermissionsPath) | Out-Null
    Invoke-Adb -Arguments @('shell', 'chown', 'root:root', $remoteApkPath) | Out-Null
    Invoke-Adb -Arguments @('shell', 'chown', 'root:root', $remotePermissionsPath) | Out-Null
    Invoke-Adb -Arguments @('shell', 'chmod', '0644', $remoteApkPath) | Out-Null
    Invoke-Adb -Arguments @('shell', 'chmod', '0644', $remotePermissionsPath) | Out-Null

    # O Player controla a TV explicitamente e o fluxo padrão não deve suspender o Box.
    Invoke-Adb -Arguments @(
        'shell',
        'settings',
        'put',
        'global',
        'hdmi_control_auto_device_off_enabled',
        '0'
    ) | Out-Null
} finally {
    Set-SystemMountMode -Mode 'ro'
}

Invoke-Adb -Arguments @('reboot') | Out-Null
& $script:adbPath -s $Serial wait-for-device | Out-Null
Wait-DeviceBootComplete
Start-Sleep -Seconds 3

$permissionState = (
    Invoke-Adb -Arguments @('shell', 'dumpsys', 'package', $packageName)
) | Select-String -Pattern 'android.permission.HDMI_CEC: granted=true'

if (-not $permissionState) {
    throw (
        'O APK foi copiado, mas a permissão HDMI_CEC não foi concedida após o reboot. ' +
        "Use o backup em $backupDirectory para rollback e revise a allowlist do firmware."
    )
}

Invoke-Adb -Arguments @(
    'shell',
    'am',
    'start',
    '-n',
    "$packageName/.MainActivity"
) | Out-Null

Write-Host "Provisionamento concluído em $model (Android $androidVersion)."
Write-Host "Permissão HDMI_CEC concedida e APK SHA-256: $apkHash"
Write-Host "Backup: $backupDirectory"
