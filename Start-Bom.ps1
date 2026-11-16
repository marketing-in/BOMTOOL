[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$Port = 3000,
    [switch]$Online,
    [switch]$StopDatabase
)

$ErrorActionPreference = 'Stop'
Push-Location -LiteralPath $PSScriptRoot
try {
    $node = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $node) {
        throw 'Node.js is required. Put node.exe on PATH; npm is not used by this launcher.'
    }
    if (-not (Test-Path -LiteralPath 'node_modules/next/dist/bin/next' -PathType Leaf)) {
        throw 'Project dependencies are missing. Use a prepared copy of this project with node_modules for Windows.'
    }
    if ($StopDatabase) {
        & $node.Source --experimental-strip-types 'scripts/db-local.ts' stop
        exit $LASTEXITCODE
    }
    if (-not $env:DATABASE_URL -and -not (Test-Path -LiteralPath '.env' -PathType Leaf)) {
        throw 'Missing .env. Configure the project using .env.example before starting it.'
    }
    if ($Online -and $PSBoundParameters.ContainsKey('Port')) {
        throw 'Online mode uses port 3001. Omit -Port when using -Online.'
    }
    if ($Online -and -not (Test-Path -LiteralPath '.tools/cloudflared.exe' -PathType Leaf)) {
        throw 'Online mode requires .tools/cloudflared.exe.'
    }

    & $node.Source 'scripts/db-ready.mjs'
    if ($LASTEXITCODE -ne 0) {
        if (-not (Test-Path -LiteralPath '.pgdata/PG_VERSION' -PathType Leaf)) {
            throw 'The configured database is unreachable and no local database has been set up. See the README for first-time setup.'
        }
        Write-Host 'Starting the local PostgreSQL database...'
        $log = Join-Path $PSScriptRoot '.pgdata'
        $database = Start-Process -FilePath $node.Source -ArgumentList @('--experimental-strip-types', 'scripts/db-local.ts') `
            -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput (Join-Path $log 'launcher.out.log') `
            -RedirectStandardError (Join-Path $log 'launcher.err.log')
        $deadline = [DateTime]::UtcNow.AddSeconds(45)
        do {
            Start-Sleep -Seconds 1
            & $node.Source 'scripts/db-ready.mjs'
            if ($LASTEXITCODE -eq 0) { break }
            if ($database.HasExited -or [DateTime]::UtcNow -ge $deadline) {
                throw 'The database did not become ready. Check .pgdata/launcher.err.log and .pgdata/launcher.out.log.'
            }
        } while ($true)
    }

    if ($Online) {
        & $node.Source --experimental-strip-types 'scripts/online.ts'
    } else {
        Write-Host "Starting the BOM tool at http://localhost:$Port (Ctrl+C to stop)..."
        & $node.Source --experimental-strip-types 'scripts/serve.ts' --port $Port
    }
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
