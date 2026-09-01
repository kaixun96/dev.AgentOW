[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Probe', 'InstallSafeDependencies', 'StageVbCable', 'LaunchVbCableInstaller', 'OpenVoiceAccess', 'InstallConsoleTransferTask', 'RunConsoleTransfer')]
    [string]$Action,

    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$vbCableUrl = 'https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack45.zip'
$vbCableSha256 = 'B950E39F01AF1D04EA623C8F6D8EB9B6EA5C477C637295FABF20631C85116BFB'
$setupRoot = Join-Path $env:LOCALAPPDATA 'agentow\a11y-host'
$vbCableRoot = Join-Path $setupRoot 'vb-cable-pack45'
$consoleTaskName = 'AgentOW-A11Y-TransferToConsole'

function Get-ExistingPath {
    param([string[]]$Candidates)

    return $Candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
}

function Get-PythonPath {
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python311\python.exe')
    )
    $existing = Get-ExistingPath $candidates
    if ($existing) {
        return $existing
    }

    $command = Get-Command python.exe -ErrorAction SilentlyContinue
    if ($command -and $command.Source -notlike '*\WindowsApps\python.exe') {
        return $command.Source
    }
    return $null
}

function Test-PythonModule {
    param(
        [string]$PythonPath,
        [string]$Module
    )

    if (-not $PythonPath) {
        return $false
    }
    & $PythonPath -c "import $Module" 2>$null
    return $LASTEXITCODE -eq 0
}

function Get-CommandInfo {
    param([string]$Name)

    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $command -and $Name -eq 'ffmpeg.exe') {
        $packageDirectory = Get-ChildItem `
            (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages') `
            -Directory `
            -Filter 'Gyan.FFmpeg_*' `
            -ErrorAction SilentlyContinue |
            Select-Object -First 1
        $commandPath = $packageDirectory |
            ForEach-Object {
                Get-ChildItem $_.FullName -Filter 'ffmpeg.exe' -File -Recurse -ErrorAction SilentlyContinue
            } |
            Select-Object -First 1 -ExpandProperty FullName
        if ($commandPath) {
            $command = Get-Item -LiteralPath $commandPath
        }
    }
    if (-not $command) {
        return [ordered]@{ available = $false; path = $null; version = $null }
    }

    $commandPath = if ($command.Source) { $command.Source } else { $command.FullName }
    $version = $null
    try {
        $version = [string](Get-Item -LiteralPath $commandPath).VersionInfo.ProductVersion
    }
    catch {
        $version = $null
    }
    if (-not $version -and $Name -eq 'ffmpeg.exe') {
        $firstLine = (& $commandPath -version 2>$null | Select-Object -First 1)
        if ($firstLine -match '^ffmpeg version ([^\s]+)') {
            $version = $Matches[1]
        }
    }
    return [ordered]@{ available = $true; path = $commandPath; version = $version }
}

function Get-SessionType {
    $userName = [Environment]::UserName
    $line = query.exe session 2>$null |
        Where-Object { $_ -match "\b$([regex]::Escape($userName))\b" } |
        Select-Object -First 1
    if ($line) {
        $tokens = @((($line -replace '^\s*>', '').Trim() -split '\s+') | Where-Object { $_ })
        if ($tokens[0] -eq 'console') {
            return 'Console'
        }
        if ($tokens[0] -match '^rdp-') {
            return 'RDP'
        }
    }
    return 'unknown'
}

function Get-ConsoleTransferScript {
    return @'
$ErrorActionPreference = 'Stop'
$driver = Get-CimInstance Win32_SystemDriver -Filter "Name='VBAudioVACMME'"
if (-not $driver) {
    throw 'VBAudioVACMME driver was not found.'
}
if ($driver.State -ne 'Running') {
    Start-Service VBAudioVACMME
}
foreach ($serviceName in 'AudioEndpointBuilder', 'Audiosrv') {
    $service = Get-Service $serviceName
    if ($service.Status -ne 'Running') {
        Start-Service $serviceName
    }
}
Start-Sleep -Seconds 5
$sessionId = Get-Process explorer |
    Where-Object SessionId -ne 0 |
    Sort-Object StartTime -Descending |
    Select-Object -First 1 -ExpandProperty SessionId
if ($null -eq $sessionId) {
    throw 'No interactive Explorer session was found.'
}
& "$env:WINDIR\System32\tscon.exe" $sessionId /dest:console
if ($LASTEXITCODE -ne 0) {
    throw "tscon failed with exit code $LASTEXITCODE."
}
'@
}

function Install-ConsoleTransferTask {
    $taskScript = Get-ConsoleTransferScript
    $encodedTask = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($taskScript))
    $action = New-ScheduledTaskAction `
        -Execute 'powershell.exe' `
        -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -EncodedCommand $encodedTask"
    $principal = New-ScheduledTaskPrincipal `
        -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) `
        -LogonType Interactive `
        -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew
    Register-ScheduledTask `
        -TaskName $consoleTaskName `
        -Action $action `
        -Principal $principal `
        -Settings $settings `
        -Description 'Prepares audio and transfers the interactive A11Y evaluator session to the console.' `
        -Force |
        Out-Null
}

function Get-AudioEndpoints {
    $devices = @(Get-PnpDevice -Class AudioEndpoint -PresentOnly -ErrorAction SilentlyContinue)
    return @($devices | ForEach-Object {
        [ordered]@{
            name = $_.FriendlyName
            status = [string]$_.Status
            instanceId = $_.InstanceId
        }
    })
}

function Get-PersistedAudioEndpoints {
    $roots = [ordered]@{
        Render = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Render'
        Capture = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Capture'
    }
    $endpoints = @()
    foreach ($entry in $roots.GetEnumerator()) {
        if (-not (Test-Path -LiteralPath $entry.Value)) {
            continue
        }
        foreach ($endpoint in Get-ChildItem -LiteralPath $entry.Value) {
            $device = Get-ItemProperty -LiteralPath $endpoint.PSPath
            $properties = Get-ItemProperty `
                -LiteralPath (Join-Path $endpoint.PSPath 'Properties') `
                -ErrorAction SilentlyContinue
            $endpoints += [ordered]@{
                type = $entry.Key
                name = [string]$properties.'{a45c254e-df1c-4efd-8020-67d146a850e0},2'
                state = [int]$device.DeviceState
                id = $endpoint.PSChildName
            }
        }
    }
    return @($endpoints)
}

function Get-VoiceAccessState {
    $voiceAccessPath = Join-Path $env:WINDIR 'System32\VoiceAccess.exe'
    $settingsPath = 'HKCU:\Software\Microsoft\VoiceAccess'
    $speechPath = Join-Path $settingsPath 'SpeechToText'
    $settings = if (Test-Path -LiteralPath $settingsPath) {
        Get-ItemProperty -LiteralPath $settingsPath
    } else {
        $null
    }
    $speech = if (Test-Path -LiteralPath $speechPath) {
        Get-ItemProperty -LiteralPath $speechPath
    } else {
        $null
    }
    $firstRunCompleted = $settings -and [int]$settings.FirstRunCompleted -eq 1
    $consentCompleted = $settings -and [int]$settings.VoiceAccessUserConsent -eq 1
    $modelsUpdated = $speech -and [int]$speech.AreModelsUpdated -gt 0

    return [ordered]@{
        available = Test-Path -LiteralPath $voiceAccessPath
        path = $voiceAccessPath
        running = [bool](Get-Process VoiceAccess -ErrorAction SilentlyContinue)
        currentLanguage = if ($settings) { [string]$settings.CurrentLanguage } else { $null }
        firstRunCompleted = [bool]$firstRunCompleted
        consentCompleted = [bool]$consentCompleted
        languageModel = if ($firstRunCompleted -and $consentCompleted -and $modelsUpdated) {
            'ready'
        } else {
            'setup-required'
        }
    }
}

function Get-Capabilities {
    $python = Get-PythonPath
    $nvda = Get-ExistingPath @(
        (Join-Path $env:ProgramFiles 'NVDA\nvda.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'NVDA\nvda.exe')
    )
    $edge = Get-ExistingPath @(
        (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
        (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
    )
    $audioEndpoints = @(Get-AudioEndpoints)
    $persistedAudioEndpoints = @(Get-PersistedAudioEndpoints)
    $cableInput = @($persistedAudioEndpoints |
        Where-Object { $_.type -eq 'Render' -and $_.name -match '^CABLE Input' -and $_.state -eq 1 })
    $cableOutput = @($persistedAudioEndpoints |
        Where-Object { $_.type -eq 'Capture' -and $_.name -match '^CABLE Output' -and $_.state -eq 1 })
    $activeCableEndpoints = @($audioEndpoints | Where-Object { $_.name -match '^CABLE (Input|Output)' })
    $audioModule = Get-Module -ListAvailable AudioDeviceCmdlets |
        Sort-Object Version -Descending |
        Select-Object -First 1
    if (-not $audioModule) {
        $moduleManifest = Get-ChildItem `
            (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'PowerShell\Modules\AudioDeviceCmdlets') `
            -Filter 'AudioDeviceCmdlets.psd1' `
            -File `
            -Recurse `
            -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending |
            Select-Object -First 1
        if ($moduleManifest) {
            $audioModule = Test-ModuleManifest -Path $moduleManifest.FullName
        }
    }
    $ffmpeg = Get-CommandInfo 'ffmpeg.exe'
    $wpr = Get-CommandInfo 'wpr.exe'
    $wpa = Get-CommandInfo 'wpa.exe'
    $sessionType = Get-SessionType

    $prerequisites = [ordered]@{
        edge = [ordered]@{
            available = [bool]$edge
            path = $edge
            version = if ($edge) { [string](Get-Item -LiteralPath $edge).VersionInfo.ProductVersion } else { $null }
        }
        nvda = [ordered]@{
            available = [bool]$nvda
            path = $nvda
            version = if ($nvda) { [string](Get-Item -LiteralPath $nvda).VersionInfo.ProductVersion } else { $null }
        }
        ffmpeg = $ffmpeg
        audioDeviceCmdlets = [ordered]@{
            available = [bool]$audioModule
            version = if ($audioModule) { [string]$audioModule.Version } else { $null }
        }
        python = [ordered]@{
            available = [bool]$python
            path = $python
            playwright = Test-PythonModule $python 'playwright'
            mss = Test-PythonModule $python 'mss'
            pyAudioWPatch = Test-PythonModule $python 'pyaudiowpatch'
        }
        windowsPerformanceRecorder = $wpr
        windowsPerformanceAnalyzer = $wpa
        voiceAccess = Get-VoiceAccessState
        vbCable = [ordered]@{
            renderEndpointReady = $cableInput.Count -gt 0
            captureEndpointReady = $cableOutput.Count -gt 0
            currentSessionAvailable = $activeCableEndpoints.Count -ge 2
            persistedEndpoints = $persistedAudioEndpoints
            currentSessionEndpoints = $audioEndpoints
        }
        session = [ordered]@{
            type = $sessionType
            persistentConsoleReady = $sessionType -eq 'Console'
        }
    }

    $pythonCaptureReady = $prerequisites.python.available -and
        $prerequisites.python.mss -and
        $prerequisites.python.pyAudioWPatch
    $vbCableReady = $prerequisites.vbCable.renderEndpointReady -and
        $prerequisites.vbCable.captureEndpointReady -and
        $prerequisites.vbCable.currentSessionAvailable

    return [ordered]@{
        schemaVersion = 1
        generatedAt = (Get-Date).ToUniversalTime().ToString('o')
        host = 'windows'
        prerequisites = $prerequisites
        scenarios = [ordered]@{
            browserKeyboard = [bool]$prerequisites.edge.available
            nvda = [bool]($prerequisites.edge.available -and $prerequisites.nvda.available)
            narratorEtw = [bool]($prerequisites.edge.available -and
                $prerequisites.windowsPerformanceRecorder.available -and
                $prerequisites.windowsPerformanceAnalyzer.available)
            unattendedRecording = [bool]($pythonCaptureReady -and $ffmpeg.available -and
                $vbCableReady -and $prerequisites.session.persistentConsoleReady)
            voiceAccess = [bool]($prerequisites.voiceAccess.available -and
                $prerequisites.voiceAccess.languageModel -eq 'ready' -and
                $prerequisites.audioDeviceCmdlets.available -and $ffmpeg.available -and
                $vbCableReady -and $prerequisites.session.persistentConsoleReady)
        }
    }
}

function Write-Capabilities {
    $capabilities = Get-Capabilities
    $json = $capabilities | ConvertTo-Json -Depth 8
    if ($OutputPath) {
        $parent = Split-Path -Parent $OutputPath
        if ($parent) {
            New-Item -ItemType Directory -Path $parent -Force | Out-Null
        }
        Set-Content -LiteralPath $OutputPath -Value $json -Encoding UTF8
    }
    Write-Output $json
}

function Invoke-WingetInstall {
    param(
        [string]$Id,
        [switch]$UserScope
    )

    $arguments = @(
        'install',
        '--id', $Id,
        '--exact',
        '--accept-package-agreements',
        '--accept-source-agreements',
        '--silent'
    )
    if ($UserScope) {
        $arguments += @('--scope', 'user')
    }
    & winget @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "winget failed for $Id with exit code $LASTEXITCODE"
    }
}

function Install-SafeDependencies {
    if (-not (Get-ExistingPath @(
        (Join-Path $env:ProgramFiles 'NVDA\nvda.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'NVDA\nvda.exe')
    ))) {
        Invoke-WingetInstall 'NVAccess.NVDA'
    }
    if (-not (Get-CommandInfo 'ffmpeg.exe').available) {
        Invoke-WingetInstall 'Gyan.FFmpeg'
    }
    $audioModule = Get-Module -ListAvailable AudioDeviceCmdlets
    if (-not $audioModule) {
        $audioModule = Get-ChildItem `
            (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'PowerShell\Modules\AudioDeviceCmdlets') `
            -Filter 'AudioDeviceCmdlets.psd1' `
            -File `
            -Recurse `
            -ErrorAction SilentlyContinue |
            Select-Object -First 1
    }
    if (-not $audioModule) {
        Install-Module AudioDeviceCmdlets -Scope CurrentUser -Force -Confirm:$false
    }

    $python = Get-PythonPath
    if (-not $python) {
        Invoke-WingetInstall 'Python.Python.3.12' -UserScope
        $python = Get-PythonPath
    }
    if (-not $python) {
        throw 'Python installation completed but python.exe was not found'
    }

    & $python -m pip install --disable-pip-version-check playwright mss PyAudioWPatch
    if ($LASTEXITCODE -ne 0) {
        throw "Python dependency installation failed with exit code $LASTEXITCODE"
    }
    & $python -m playwright install chromium
    if ($LASTEXITCODE -ne 0) {
        throw "Playwright browser installation failed with exit code $LASTEXITCODE"
    }
}

function Stage-VbCable {
    New-Item -ItemType Directory -Path $setupRoot -Force | Out-Null
    $zipPath = Join-Path $setupRoot 'VBCABLE_Driver_Pack45.zip'
    Invoke-WebRequest -Uri $vbCableUrl -OutFile $zipPath

    $actualHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash
    if ($actualHash -ne $vbCableSha256) {
        throw "VB-CABLE package hash mismatch. Expected $vbCableSha256, received $actualHash"
    }

    if (Test-Path -LiteralPath $vbCableRoot) {
        Remove-Item -LiteralPath $vbCableRoot -Recurse -Force
    }
    Expand-Archive -LiteralPath $zipPath -DestinationPath $vbCableRoot
    $installer = Join-Path $vbCableRoot 'VBCABLE_Setup_x64.exe'
    if (-not (Test-Path -LiteralPath $installer)) {
        throw "VB-CABLE installer was not found at $installer"
    }

    $signature = Get-AuthenticodeSignature -FilePath $installer
    if ($signature.Status -ne 'Valid' -or
        $signature.SignerCertificate.Subject -notmatch 'CN=BUREL VINCENT') {
        throw "VB-CABLE installer signature is not valid for the expected publisher"
    }

    return $installer
}

if ($env:OS -ne 'Windows_NT') {
    throw 'ow-a11y-host-setup must run on Windows'
}

switch ($Action) {
    'Probe' {
        Write-Capabilities
    }
    'InstallSafeDependencies' {
        Install-SafeDependencies
        Write-Capabilities
    }
    'StageVbCable' {
        Write-Output (Stage-VbCable)
    }
    'LaunchVbCableInstaller' {
        $installer = Stage-VbCable
        $process = Start-Process -FilePath $installer -Verb RunAs -PassThru
        $process.WaitForExit()
        Write-Capabilities
    }
    'OpenVoiceAccess' {
        $voiceAccess = Join-Path $env:WINDIR 'System32\VoiceAccess.exe'
        if (-not (Test-Path -LiteralPath $voiceAccess)) {
            throw 'Voice Access is unavailable. Windows 11 version 22H2 or later is required.'
        }
        Start-Process -FilePath $voiceAccess
        Start-Sleep -Seconds 3
        Write-Capabilities
    }
    'InstallConsoleTransferTask' {
        Install-ConsoleTransferTask
        Get-ScheduledTask -TaskName $consoleTaskName |
            Select-Object TaskName, State, @{ Name = 'Principal'; Expression = { $_.Principal.UserId } },
                @{ Name = 'LogonType'; Expression = { $_.Principal.LogonType } },
                @{ Name = 'RunLevel'; Expression = { $_.Principal.RunLevel } }
    }
    'RunConsoleTransfer' {
        $task = Get-ScheduledTask -TaskName $consoleTaskName -ErrorAction Stop
        if ($task.Principal.LogonType -ne 'Interactive') {
            throw "$consoleTaskName is not configured with InteractiveToken"
        }
        Start-ScheduledTask -TaskName $consoleTaskName
        Write-Output "$consoleTaskName started. The RDP session will disconnect."
    }
}
