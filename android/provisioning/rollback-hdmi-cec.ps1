[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$Serial,

    [string]$ReplacementApkPath,

    [string]$GloboplayBackupPath
)

$ErrorActionPreference = 'Stop'

$packageName = 'com.indoorplayer'
$remoteAppDirectory = '/system/priv-app/IndoorPlayer'
$remoteApkPath = "$remoteAppDirectory/IndoorPlayer.apk"
$remotePermissionsPath = '/system/etc/permissions/privapp-permissions-com.indoorplayer.xml'
$remoteGloboplayDirectory = '/system/priv-app/Globoplay'
$temporaryGloboplayDirectory = '/data/local/tmp/IndoorPlayer-Globoplay-restore'
$adbPath = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
$expectedGloboplayFiles = @(
    'base.apk',
    'split_config.armeabi_v7a.apk',
    'split_config.pt.apk',
    'split_config.tvdpi.apk'
)

if (-not (Test-Path -LiteralPath $adbPath -PathType Leaf)) {
    throw 'adb.exe nao foi encontrado no Android SDK do usuario.'
}

function Invoke-Adb {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,

        [switch]$AllowFailure
    )

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

    return $output
}

function Wait-DeviceBootComplete {
    for ($attempt = 1; $attempt -le 30; $attempt++) {
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

$script:adbPath = $adbPath
$identity = (Invoke-Adb -Arguments @('shell', 'id')) -join ' '

if ($identity -notmatch 'uid=0\(root\)') {
    throw 'O rollback exige ADB com acesso root.'
}

$resolvedReplacement = $null

if ($ReplacementApkPath) {
    $resolvedReplacement = (Resolve-Path -LiteralPath $ReplacementApkPath).Path
}

$resolvedGloboplayBackup = $null

if ($GloboplayBackupPath) {
    $resolvedGloboplayBackup = (Resolve-Path -LiteralPath $GloboplayBackupPath).Path

    foreach ($fileName in $expectedGloboplayFiles) {
        $filePath = Join-Path $resolvedGloboplayBackup $fileName

        if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
            throw "Backup incompleto do Globoplay. Arquivo ausente: $fileName"
        }
    }
}

$rollbackDescription = 'Remover a instalacao privilegiada do Indoor Player'

if ($resolvedGloboplayBackup) {
    $rollbackDescription += ' e restaurar o Globoplay a partir do backup validado'
}

$rollbackDescription += ', depois reiniciar o TV Box'

if (-not $PSCmdlet.ShouldProcess($Serial, $rollbackDescription)) {
    return
}

if ($resolvedGloboplayBackup) {
    Invoke-Adb -Arguments @('shell', 'rm', '-rf', $temporaryGloboplayDirectory) | Out-Null
    Invoke-Adb -Arguments @('shell', 'mkdir', '-p', $temporaryGloboplayDirectory) | Out-Null

    foreach ($fileName in $expectedGloboplayFiles) {
        Invoke-Adb -Arguments @(
            'push',
            (Join-Path $resolvedGloboplayBackup $fileName),
            "$temporaryGloboplayDirectory/$fileName"
        ) | Out-Null
    }
}

Invoke-Adb -Arguments @('shell', 'mount', '-o', 'rw,remount', '/') | Out-Null

try {
    Invoke-Adb -Arguments @('shell', 'rm', '-f', $remoteApkPath) | Out-Null
    Invoke-Adb -Arguments @('shell', 'rmdir', $remoteAppDirectory) -AllowFailure | Out-Null
    Invoke-Adb -Arguments @('shell', 'rm', '-f', $remotePermissionsPath) | Out-Null

    if ($resolvedGloboplayBackup) {
        Invoke-Adb -Arguments @('shell', 'mkdir', '-p', $remoteGloboplayDirectory) | Out-Null

        foreach ($fileName in $expectedGloboplayFiles) {
            $remoteFilePath = "$remoteGloboplayDirectory/$fileName"

            Invoke-Adb -Arguments @(
                'shell',
                'cp',
                "$temporaryGloboplayDirectory/$fileName",
                $remoteFilePath
            ) | Out-Null
            Invoke-Adb -Arguments @('shell', 'chown', 'root:root', $remoteFilePath) | Out-Null
            Invoke-Adb -Arguments @('shell', 'chmod', '0644', $remoteFilePath) | Out-Null
        }
    }

    Invoke-Adb -Arguments @('shell', 'sync') | Out-Null
} finally {
    Invoke-Adb -Arguments @('shell', 'mount', '-o', 'ro,remount', '/') | Out-Null
}

Invoke-Adb -Arguments @('reboot') | Out-Null
& $script:adbPath -s $Serial wait-for-device | Out-Null
Wait-DeviceBootComplete
Start-Sleep -Seconds 3

if ($resolvedReplacement) {
    Invoke-Adb -Arguments @('install', '-r', $resolvedReplacement) | Out-Null
}

Invoke-Adb -Arguments @('shell', 'rm', '-rf', $temporaryGloboplayDirectory) -AllowFailure |
    Out-Null

$packagePath = (
    Invoke-Adb -Arguments @('shell', 'pm', 'path', $packageName) -AllowFailure
) -join ''

if ($packagePath -match '^package:/system/priv-app/IndoorPlayer/') {
    throw 'O rollback terminou, mas o Indoor Player ainda aparece como aplicativo de sistema.'
}

if ($resolvedGloboplayBackup) {
    $globoplayPath = (
        Invoke-Adb -Arguments @('shell', 'pm', 'path', 'com.globo.globoplay') -AllowFailure
    ) -join ''

    if (-not $globoplayPath) {
        Write-Warning 'Os arquivos do Globoplay foram restaurados, mas o pacote nao foi identificado automaticamente.'
    }
}

Write-Host 'Instalacao privilegiada removida. O controle HDMI-CEC protegido nao estara disponivel.'

if ($resolvedGloboplayBackup) {
    Write-Host "Globoplay restaurado a partir de: $resolvedGloboplayBackup"
}
