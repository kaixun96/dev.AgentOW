function Convert-AgentOWSessionLine {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Line,

        [Parameter(Mandatory = $true)]
        [ValidateSet('User', 'Session')]
        [string]$Format
    )

    $tokens = @((($Line -replace '^\s*>', '').Trim() -split '\s+') | Where-Object { $_ })
    if ($Format -eq 'User' -and $tokens.Count -ge 4 -and $tokens[2] -match '^\d+$') {
        return [ordered]@{
            user = $tokens[0]
            sessionName = $tokens[1]
            sessionId = [int]$tokens[2]
            state = $tokens[3]
        }
    }
    if ($Format -eq 'Session' -and $tokens.Count -ge 4 -and $tokens[2] -match '^\d+$') {
        return [ordered]@{
            sessionName = $tokens[0]
            user = $tokens[1]
            sessionId = [int]$tokens[2]
            state = $tokens[3]
        }
    }
    return $null
}

function Select-AgentOWActiveRdpSession {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Lines,

        [Parameter(Mandatory = $true)]
        [string]$ExpectedUser
    )

    $candidates = @($Lines |
        ForEach-Object { Convert-AgentOWSessionLine -Line $_ -Format User } |
        Where-Object {
            $_ -and
            $_.user -eq $ExpectedUser -and
            $_.sessionName -match '^rdp-sxs' -and
            $_.state -eq 'Active'
        })
    if ($candidates.Count -ne 1) {
        throw "Expected exactly one active rdp-sxs session for $ExpectedUser; found $($candidates.Count)."
    }
    return $candidates[0]
}

function Test-AgentOWReadinessHeartbeat {
    param(
        [Parameter(Mandatory = $true)]
        $Heartbeat,

        [Parameter(Mandatory = $true)]
        [string]$ExpectedUser,

        [Parameter(Mandatory = $true)]
        [int]$ExpectedSessionId,

        [Parameter(Mandatory = $true)]
        [ValidateSet('Bootstrap', 'Console')]
        [string]$Phase,

        [Parameter(Mandatory = $true)]
        [DateTimeOffset]$NotBefore
    )

    try {
        $heartbeatAt = [DateTimeOffset]::Parse([string]$Heartbeat.heartbeatAt)
    }
    catch {
        return $false
    }
    $sessionMatches = if ($Phase -eq 'Bootstrap') {
        $Heartbeat.sessionName -match '^rdp-sxs'
    } else {
        $Heartbeat.sessionName -eq 'console' -and $Heartbeat.consoleUnlocked -eq $true
    }
    return [bool](
        $heartbeatAt -gt $NotBefore -and
        $Heartbeat.user -eq $ExpectedUser -and
        [int]$Heartbeat.sessionId -eq $ExpectedSessionId -and
        $Heartbeat.sessionState -eq 'Active' -and
        $sessionMatches -and
        $Heartbeat.atReady -eq $true -and
        $Heartbeat.authenticated -eq $true -and
        $Heartbeat.legacyLockPresent -eq $false -and
        $Heartbeat.secureSurfacePresent -eq $false -and
        $Heartbeat.voiceAccessStopped -eq $true
    )
}
