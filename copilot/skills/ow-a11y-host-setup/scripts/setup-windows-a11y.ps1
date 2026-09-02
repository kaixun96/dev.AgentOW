[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Probe', 'InstallSafeDependencies', 'InstallPersonalEvaluatorBrowser', 'CheckPersonalEvaluatorBrowser', 'StageVbCable', 'LaunchVbCableInstaller', 'OpenVoiceAccess', 'InstallConsoleTransferTask', 'RunConsoleTransfer', 'ValidateHost')]
    [string]$Action,

    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'

if ($env:CODESPACES -eq 'true' -or -not [string]::IsNullOrWhiteSpace($env:CODESPACE_NAME)) {
    throw '/ow-a11y-host-setup is not supported in a Codespace. Run it on the Windows evaluator host.'
}

if ($env:OS -ne 'Windows_NT') {
    throw 'ow-a11y-host-setup must run on the Windows evaluator host'
}

$vbCableUrl = 'https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack45.zip'
$vbCableSha256 = 'B950E39F01AF1D04EA623C8F6D8EB9B6EA5C477C637295FABF20631C85116BFB'
$setupRoot = Join-Path $env:LOCALAPPDATA 'agentow\a11y-host'
$vbCableRoot = Join-Path $setupRoot 'vb-cable-pack45'
$consoleTaskName = 'AgentOW-A11Y-TransferToConsole'
$personalEvaluatorSources = @(
    (Join-Path $PSScriptRoot '..\..\..\tools\personal-evaluator-browser.py'),
    (Join-Path $PSScriptRoot '..\..\..\..\tools\personal-evaluator-browser.py')
)
$personalEvaluatorPath = Join-Path $setupRoot 'personal-evaluator-browser.py'
$personalEvaluatorProfile = Join-Path $HOME '.playwright\personal-evaluator-profile'
$personalEvaluatorAuthStatePath = Join-Path $setupRoot 'personal-evaluator-auth.json'
$personalEvaluatorAuthMaxAge = [TimeSpan]::FromMinutes(30)

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

function Get-Sha256 {
    param([string]$Path)

    $stream = [IO.File]::OpenRead($Path)
    try {
        $sha256 = [Security.Cryptography.SHA256]::Create()
        try {
            return ([BitConverter]::ToString($sha256.ComputeHash($stream))).Replace('-', '')
        }
        finally {
            $sha256.Dispose()
        }
    }
    finally {
        $stream.Dispose()
    }
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

function Get-ConsoleTransferState {
    $task = Get-ScheduledTask -TaskName $consoleTaskName -ErrorAction SilentlyContinue
    if (-not $task) {
        return [ordered]@{
            installed = $false
            state = $null
            lastRunTime = $null
            lastTaskResult = $null
        }
    }

    $info = Get-ScheduledTaskInfo -TaskName $consoleTaskName
    return [ordered]@{
        installed = $true
        state = [string]$task.State
        lastRunTime = if ($info.LastRunTime.Year -gt 2000) {
            $info.LastRunTime.ToUniversalTime().ToString('o')
        } else {
            $null
        }
        lastTaskResult = [int]$info.LastTaskResult
    }
}

function Get-PersonalEvaluatorState {
    $installed = Test-Path -LiteralPath $personalEvaluatorPath
    $profileExists = Test-Path -LiteralPath $personalEvaluatorProfile
    $scriptHash = if ($installed) {
        Get-Sha256 $personalEvaluatorPath
    } else {
        $null
    }
    $authenticated = $false
    $lastCheckedAt = $null
    if ($profileExists -and (Test-Path -LiteralPath $personalEvaluatorAuthStatePath)) {
        try {
            $authState = Get-Content -LiteralPath $personalEvaluatorAuthStatePath -Raw | ConvertFrom-Json
            $checkedAt = [DateTimeOffset]::Parse([string]$authState.checkedAt)
            $fresh = [DateTimeOffset]::UtcNow - $checkedAt.ToUniversalTime() -le $personalEvaluatorAuthMaxAge
            $authenticated = $authState.state -eq 'authenticated' -and
                $authState.scriptSha256 -eq $scriptHash -and
                $fresh
            $lastCheckedAt = $checkedAt.ToUniversalTime().ToString('o')
        }
        catch {
            $authenticated = $false
        }
    }

    return [ordered]@{
        installed = $installed
        scriptPath = $personalEvaluatorPath
        profileExists = $profileExists
        profilePath = $personalEvaluatorProfile
        authenticated = [bool]$authenticated
        lastCheckedAt = $lastCheckedAt
        authenticationMaxAgeMinutes = [int]$personalEvaluatorAuthMaxAge.TotalMinutes
    }
}

function Install-PersonalEvaluatorBrowser {
    $source = Get-ExistingPath $personalEvaluatorSources
    if (-not $source) {
        throw "Personal evaluator source was not found at: $($personalEvaluatorSources -join ', ')"
    }
    New-Item -ItemType Directory -Path $setupRoot -Force | Out-Null
    Copy-Item -LiteralPath $source -Destination $personalEvaluatorPath -Force
    Remove-Item -LiteralPath $personalEvaluatorAuthStatePath -Force -ErrorAction SilentlyContinue
    Write-Output $personalEvaluatorPath
}

function Check-PersonalEvaluatorBrowser {
    if (-not (Test-Path -LiteralPath $personalEvaluatorPath)) {
        throw 'InstallPersonalEvaluatorBrowser must run before CheckPersonalEvaluatorBrowser'
    }
    $python = Get-PythonPath
    if (-not $python) {
        throw 'Python is required for the personal evaluator browser'
    }
    Remove-Item -LiteralPath $personalEvaluatorAuthStatePath -Force -ErrorAction SilentlyContinue
    $output = @(& $python $personalEvaluatorPath check 2>&1)
    $exitCode = $LASTEXITCODE
    $jsonLine = $output |
        ForEach-Object { [string]$_ } |
        Where-Object { $_.Trim().StartsWith('{') } |
        Select-Object -Last 1
    $result = if ($jsonLine) {
        $jsonLine | ConvertFrom-Json
    } else {
        $null
    }
    $output | Write-Output
    if ($exitCode -ne 0 -or -not $result -or $result.state -ne 'authenticated') {
        throw "Personal evaluator browser authentication check failed with exit code $exitCode"
    }
    [ordered]@{
        state = 'authenticated'
        checkedAt = [DateTimeOffset]::UtcNow.ToString('o')
        scriptSha256 = Get-Sha256 $personalEvaluatorPath
        profilePath = $personalEvaluatorProfile
    } | ConvertTo-Json | Set-Content -LiteralPath $personalEvaluatorAuthStatePath -Encoding UTF8
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

function Get-DefaultRecordingEndpoint {
    param($AudioModule)

    if (-not $AudioModule) {
        return [ordered]@{ available = $false; name = $null; id = $null; error = 'AudioDeviceCmdlets unavailable' }
    }
    try {
        Import-Module $AudioModule.Path -Force
        $device = Get-AudioDevice -Recording
        return [ordered]@{
            available = [bool]$device
            name = if ($device) { [string]$device.Name } else { $null }
            id = if ($device) { [string]$device.ID } else { $null }
            error = $null
        }
    }
    catch {
        return [ordered]@{
            available = $false
            name = $null
            id = $null
            error = $_.Exception.Message
        }
    }
}

function Get-NvdaSpeechViewerState {
    $iniPath = Join-Path $env:APPDATA 'nvda\nvda.ini'
    if (-not (Test-Path -LiteralPath $iniPath)) {
        return [ordered]@{ configured = $false; path = $iniPath }
    }

    $content = Get-Content -LiteralPath $iniPath -Raw
    $configured = $content -match '(?ims)^\[speechViewer\]\s*$.*?^\s*showSpeechViewerAtStartup\s*=\s*True\s*$'
    return [ordered]@{ configured = [bool]$configured; path = $iniPath }
}

function Set-NvdaSpeechViewer {
    $state = Get-NvdaSpeechViewerState
    if ($state.configured) {
        return
    }

    $iniPath = $state.path
    $parent = Split-Path -Parent $iniPath
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
    $lines = if (Test-Path -LiteralPath $iniPath) {
        @(Get-Content -LiteralPath $iniPath)
    } else {
        @()
    }
    $sectionIndex = -1
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i].Trim() -eq '[speechViewer]') {
            $sectionIndex = $i
            break
        }
    }
    if ($sectionIndex -lt 0) {
        if ($lines.Count -gt 0 -and $lines[-1].Trim()) {
            $lines += ''
        }
        $lines += '[speechViewer]'
        $lines += 'showSpeechViewerAtStartup = True'
    } else {
        $sectionEnd = $lines.Count
        for ($i = $sectionIndex + 1; $i -lt $lines.Count; $i++) {
            if ($lines[$i].Trim() -match '^\[.+\]$') {
                $sectionEnd = $i
                break
            }
        }
        $keyIndex = -1
        for ($i = $sectionIndex + 1; $i -lt $sectionEnd; $i++) {
            if ($lines[$i] -match '^\s*showSpeechViewerAtStartup\s*=') {
                $keyIndex = $i
                break
            }
        }
        if ($keyIndex -ge 0) {
            $lines[$keyIndex] = 'showSpeechViewerAtStartup = True'
        } else {
            $before = @($lines[0..$sectionIndex])
            $after = if ($sectionIndex + 1 -lt $lines.Count) {
                @($lines[($sectionIndex + 1)..($lines.Count - 1)])
            } else {
                @()
            }
            $lines = @($before + 'showSpeechViewerAtStartup = True' + $after)
        }
    }
    Set-Content -LiteralPath $iniPath -Value $lines -Encoding UTF8
}

function Get-VoiceAccessState {
    param(
        [object[]]$CableCaptureEndpoints,
        [object[]]$CurrentSessionEndpoints,
        $DefaultRecordingEndpoint
    )

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
    $microphoneId = if ($settings) { [string]$settings.VoiceAccessMicrophoneId } else { $null }
    $microphoneReady = @($CableCaptureEndpoints | Where-Object {
        $microphoneId -and $microphoneId.IndexOf($_.id, [StringComparison]::OrdinalIgnoreCase) -ge 0
    }).Count -gt 0
    $remoteAudioPresent = @($CurrentSessionEndpoints | Where-Object {
        $_.name -match '^Remote Audio'
    }).Count -gt 0
    $cableCapturePresent = @($CurrentSessionEndpoints | Where-Object {
        $_.name -match '^CABLE Output'
    }).Count -gt 0
    $defaultCableReady = $DefaultRecordingEndpoint.available -and
        $DefaultRecordingEndpoint.name -match '^CABLE Output'
    $microphoneMode = if ($microphoneReady) {
        'explicit-cable'
    } elseif ($cableCapturePresent -and $defaultCableReady -and -not $remoteAudioPresent) {
        'default-cable-fallback'
    } elseif ($remoteAudioPresent) {
        'remote-audio-active'
    } else {
        'unresolved'
    }

    return [ordered]@{
        available = Test-Path -LiteralPath $voiceAccessPath
        path = $voiceAccessPath
        running = [bool](Get-Process VoiceAccess -ErrorAction SilentlyContinue)
        currentLanguage = if ($settings) { [string]$settings.CurrentLanguage } else { $null }
        firstRunCompleted = [bool]$firstRunCompleted
        consentCompleted = [bool]$consentCompleted
        microphoneId = $microphoneId
        microphoneMode = $microphoneMode
        microphoneReady = $microphoneMode -in @('explicit-cable', 'default-cable-fallback')
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
    $defaultRecordingEndpoint = Get-DefaultRecordingEndpoint $audioModule

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
            speechViewer = Get-NvdaSpeechViewerState
        }
        ffmpeg = $ffmpeg
        audioDeviceCmdlets = [ordered]@{
            available = [bool]$audioModule
            version = if ($audioModule) { [string]$audioModule.Version } else { $null }
            defaultRecordingEndpoint = $defaultRecordingEndpoint
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
        personalEvaluatorBrowser = Get-PersonalEvaluatorState
        voiceAccess = Get-VoiceAccessState $cableOutput $audioEndpoints $defaultRecordingEndpoint
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
            consoleTransfer = Get-ConsoleTransferState
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
            browserKeyboard = [bool]($prerequisites.edge.available -and
                $prerequisites.python.available -and
                $prerequisites.python.playwright -and
                $prerequisites.personalEvaluatorBrowser.installed -and
                $prerequisites.personalEvaluatorBrowser.profileExists -and
                $prerequisites.personalEvaluatorBrowser.authenticated)
            nvda = [bool]($prerequisites.edge.available -and $prerequisites.nvda.available -and
                $prerequisites.nvda.speechViewer.configured)
            narratorEtw = [bool]($prerequisites.edge.available -and
                $prerequisites.windowsPerformanceRecorder.available -and
                $prerequisites.windowsPerformanceAnalyzer.available)
            unattendedRecording = [bool]($pythonCaptureReady -and $ffmpeg.available -and
                $vbCableReady -and $prerequisites.session.persistentConsoleReady)
            voiceAccess = [bool]($prerequisites.voiceAccess.available -and
                $prerequisites.voiceAccess.languageModel -eq 'ready' -and
                $prerequisites.voiceAccess.microphoneReady -and
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

    Set-NvdaSpeechViewer
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

    $actualHash = Get-Sha256 $zipPath
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

function Invoke-HostValidation {
    if ((Get-SessionType) -ne 'Console') {
        throw 'Host validation requires an active Console session'
    }
    $python = Get-PythonPath
    if (-not $python) {
        throw 'Python is required for host validation'
    }

    $validationScript = @'
import json
import math
import statistics
import struct
import threading
import time
import mss
import pyaudiowpatch as pyaudio

result = {"schemaVersion": 1}
with mss.MSS() as capture:
    monitor = capture.monitors[0]
    frame = capture.grab(monitor)
    sample = bytes(frame.rgb)[::97]
    result["screen"] = {
        "width": frame.width,
        "height": frame.height,
        "mean": round(statistics.fmean(sample), 2),
        "std": round(statistics.pstdev(sample), 2),
    }

channels = 2
audio = pyaudio.PyAudio()
try:
    devices = [audio.get_device_info_by_index(i) for i in range(audio.get_device_count())]
    outputs = [
        (i, d) for i, d in enumerate(devices)
        if d["name"].startswith("CABLE Input")
        and d["maxOutputChannels"] >= channels
        and not d.get("isLoopbackDevice", False)
    ]
    inputs = [
        (i, d) for i, d in enumerate(devices)
        if d["name"].startswith("CABLE Output") and d["maxInputChannels"] >= channels
    ]
    outputs.sort(key=lambda pair: pair[1]["hostApi"] != 2)
    inputs.sort(key=lambda pair: pair[1]["hostApi"] != 2)
    if not outputs or not inputs:
        raise RuntimeError("CABLE Input/Output devices are not available to PyAudio")
    output_index, output_device = outputs[0]
    input_index, input_device = inputs[0]
    candidate_rates = []
    for candidate in (
        output_device.get("defaultSampleRate"),
        input_device.get("defaultSampleRate"),
        48000,
        44100,
    ):
        rate = int(candidate)
        if rate not in candidate_rates:
            candidate_rates.append(rate)
    rate = None
    for candidate in candidate_rates:
        try:
            audio.is_format_supported(
                candidate,
                output_device=output_index,
                output_channels=channels,
                output_format=pyaudio.paInt16,
            )
            audio.is_format_supported(
                candidate,
                input_device=input_index,
                input_channels=channels,
                input_format=pyaudio.paInt16,
            )
            rate = candidate
            break
        except ValueError:
            continue
    if rate is None:
        raise RuntimeError("CABLE Input/Output do not share a supported sample rate")
    play_frames = rate
    capture_frames = int(rate * 1.5)
    captured = []

    def record():
        stream = audio.open(
            format=pyaudio.paInt16,
            channels=channels,
            rate=rate,
            input=True,
            input_device_index=input_index,
            frames_per_buffer=1024,
        )
        try:
            remaining = capture_frames
            while remaining > 0:
                count = min(1024, remaining)
                captured.append(stream.read(count, exception_on_overflow=False))
                remaining -= count
        finally:
            stream.close()

    recorder = threading.Thread(target=record)
    recorder.start()
    time.sleep(0.2)
    stream = audio.open(
        format=pyaudio.paInt16,
        channels=channels,
        rate=rate,
        output=True,
        output_device_index=output_index,
        frames_per_buffer=1024,
    )
    try:
        sent = 0
        while sent < play_frames:
            count = min(1024, play_frames - sent)
            data = bytearray()
            for offset in range(count):
                value = int(12000 * math.sin(2 * math.pi * 1000 * (sent + offset) / rate))
                data.extend(struct.pack("<hh", value, value))
            stream.write(bytes(data))
            sent += count
    finally:
        stream.close()
    recorder.join(timeout=5)
    if recorder.is_alive():
        raise RuntimeError("Audio capture did not complete")
    raw = b"".join(captured)
    values = struct.unpack("<" + "h" * (len(raw) // 2), raw)
    rms = math.sqrt(sum(value * value for value in values) / max(1, len(values)))
    peak = max(abs(value) for value in values) if values else 0
    result["audio"] = {
        "rms": round(rms, 2),
        "peak": peak,
        "sampleRate": rate,
        "capturedSamples": len(values),
        "outputDevice": output_device["name"],
        "inputDevice": input_device["name"],
    }
finally:
    audio.terminate()

result["passed"] = (
    result["screen"]["std"] > 1
    and result["audio"]["rms"] > 500
    and result["audio"]["peak"] > 1000
)
print(json.dumps(result))
'@
    $output = $validationScript | & $python -
    if ($LASTEXITCODE -ne 0) {
        throw "Host validation failed with exit code $LASTEXITCODE"
    }
    $result = $output | Select-Object -Last 1 | ConvertFrom-Json
    if (-not $result.passed) {
        throw "Host validation did not meet image variance or audio thresholds: $output"
    }
    return $result
}

switch ($Action) {
    'Probe' {
        Write-Capabilities
    }
    'InstallSafeDependencies' {
        Install-SafeDependencies
        Write-Capabilities
    }
    'InstallPersonalEvaluatorBrowser' {
        Install-PersonalEvaluatorBrowser
        Write-Capabilities
    }
    'CheckPersonalEvaluatorBrowser' {
        Check-PersonalEvaluatorBrowser
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
        $before = Get-ScheduledTaskInfo -TaskName $consoleTaskName
        Start-ScheduledTask -TaskName $consoleTaskName
        $deadline = (Get-Date).AddSeconds(90)
        do {
            Start-Sleep -Seconds 2
            $currentTask = Get-ScheduledTask -TaskName $consoleTaskName
            $currentInfo = Get-ScheduledTaskInfo -TaskName $consoleTaskName
            $newRunStarted = $currentInfo.LastRunTime -gt $before.LastRunTime
        } while (
            (Get-Date) -lt $deadline -and
            (-not $newRunStarted -or $currentTask.State -eq 'Running')
        )
        if (-not $newRunStarted) {
            throw "$consoleTaskName did not start within 90 seconds"
        }
        if ($currentTask.State -eq 'Running') {
            throw "$consoleTaskName did not finish within 90 seconds"
        }
        if ($currentInfo.LastTaskResult -ne 0) {
            throw "$consoleTaskName failed with result $($currentInfo.LastTaskResult)"
        }
        Write-Output "$consoleTaskName completed successfully."
    }
    'ValidateHost' {
        $validation = Invoke-HostValidation
        $json = $validation | ConvertTo-Json -Depth 5
        if ($OutputPath) {
            $parent = Split-Path -Parent $OutputPath
            if ($parent) {
                New-Item -ItemType Directory -Path $parent -Force | Out-Null
            }
            Set-Content -LiteralPath $OutputPath -Value $json -Encoding UTF8
        }
        Write-Output $json
    }
}
