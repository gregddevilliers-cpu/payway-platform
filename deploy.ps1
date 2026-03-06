# ============================================================================
# Active Fleet Platform — Windows Server 2022 Deployment Script
# ============================================================================
# Prerequisites: Docker Desktop or Docker Engine installed and running
# Usage:
#   .\deploy.ps1                    # Deploy with default settings
#   .\deploy.ps1 -Seed              # Deploy and seed demo data
#   .\deploy.ps1 -Down              # Stop all services
#   .\deploy.ps1 -Rebuild           # Rebuild and redeploy
# ============================================================================

param(
    [switch]$Seed,
    [switch]$Down,
    [switch]$Rebuild,
    [string]$SqlPassword = "",
    [string]$JwtSecret = "",
    [string]$Domain = "localhost"
)

$ErrorActionPreference = "Stop"

# ─── Colours ─────────────────────────────────────────────────────────────────
function Write-Step { param([string]$msg) Write-Host "`n=> $msg" -ForegroundColor Cyan }
function Write-Ok   { param([string]$msg) Write-Host "   $msg" -ForegroundColor Green }
function Write-Warn { param([string]$msg) Write-Host "   $msg" -ForegroundColor Yellow }
function Write-Err  { param([string]$msg) Write-Host "   $msg" -ForegroundColor Red }

# ─── Handle -Down ────────────────────────────────────────────────────────────
if ($Down) {
    Write-Step "Stopping all Active Fleet services..."
    docker compose -f docker-compose.prod.yml down
    Write-Ok "All services stopped."
    exit 0
}

# ─── 1. Check Docker ────────────────────────────────────────────────────────
Write-Step "Checking Docker..."
try {
    $dockerVersion = docker version --format '{{.Server.Version}}' 2>$null
    Write-Ok "Docker Engine $dockerVersion detected."
} catch {
    Write-Err "Docker is not running. Please start Docker Desktop or Docker Engine."
    exit 1
}

# ─── 2. Generate .env file ──────────────────────────────────────────────────
Write-Step "Configuring environment..."

$envFile = ".env"
$needsNewEnv = -not (Test-Path $envFile)

if ($needsNewEnv) {
    # Generate secure random password if not provided
    if (-not $SqlPassword) {
        $chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#%"
        $SqlPassword = "AF_" + -join ((1..20) | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] }) + "!"
    }
    if (-not $JwtSecret) {
        $bytes = New-Object byte[] 48
        [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
        $JwtSecret = [Convert]::ToBase64String($bytes)
    }

    $apiUrl = if ($Domain -eq "localhost") { "http://localhost/api/v1" } else { "https://$Domain/api/v1" }

    @"
# ── Database (MSSQL) ─────────────────────────────────────
DATABASE_URL=sqlserver://mssql:1433;database=ActiveFleet;user=sa;password=$SqlPassword;trustServerCertificate=true;encrypt=true
MSSQL_SA_PASSWORD=$SqlPassword
MSSQL_PID=Developer
MSSQL_MEMORY_LIMIT_MB=98304

# ── Redis ─────────────────────────────────────────────────
REDIS_URL=redis://redis:6379

# ── Backend ───────────────────────────────────────────────
NODE_ENV=production
PORT=3001
JWT_SECRET=$JwtSecret

# ── Frontend ──────────────────────────────────────────────
NEXT_PUBLIC_API_URL=$apiUrl
"@ | Set-Content -Path $envFile -Encoding UTF8

    Write-Ok "Created .env with generated credentials."
    Write-Warn "MSSQL SA Password: $SqlPassword"
    Write-Warn "Save this password securely — it won't be shown again."
} else {
    Write-Ok ".env already exists, using existing configuration."
    # Load existing password for use later
    $envContent = Get-Content $envFile -Raw
    if ($envContent -match 'MSSQL_SA_PASSWORD=(.+)') {
        $SqlPassword = $Matches[1].Trim()
    }
}

# ─── 3. Build and start services ────────────────────────────────────────────
Write-Step "Starting Active Fleet services..."

if ($Rebuild) {
    Write-Ok "Rebuilding containers..."
    docker compose -f docker-compose.prod.yml build --no-cache
}

docker compose -f docker-compose.prod.yml up -d

# ─── 4. Wait for MSSQL to be healthy ────────────────────────────────────────
Write-Step "Waiting for MSSQL to become healthy..."
$maxAttempts = 30
$attempt = 0
do {
    Start-Sleep -Seconds 5
    $attempt++
    $health = docker inspect --format='{{.State.Health.Status}}' (docker compose -f docker-compose.prod.yml ps -q mssql) 2>$null
    Write-Host "   Attempt $attempt/$maxAttempts — status: $health" -ForegroundColor Gray
} while ($health -ne "healthy" -and $attempt -lt $maxAttempts)

if ($health -ne "healthy") {
    Write-Err "MSSQL did not become healthy within $(($maxAttempts * 5)) seconds."
    Write-Err "Check logs with: docker compose -f docker-compose.prod.yml logs mssql"
    exit 1
}
Write-Ok "MSSQL is healthy."

# ─── 5. Run database creation script ────────────────────────────────────────
Write-Step "Creating database and tables..."
# The mssql-init service handles this automatically, but let's verify
Start-Sleep -Seconds 10
$initLogs = docker compose -f docker-compose.prod.yml logs mssql-init 2>$null
if ($initLogs -match "created successfully") {
    Write-Ok "Database tables created via init container."
} else {
    Write-Warn "Init container may still be running. Checking manually..."
    # Run the script directly as a fallback
    docker compose -f docker-compose.prod.yml exec -T mssql /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$SqlPassword" -C -i /database/create-database.sql 2>$null
    if ($LASTEXITCODE -ne 0) {
        # The database volume may already exist from a previous run
        Write-Warn "Database may already exist from a previous deployment."
    } else {
        Write-Ok "Database tables created."
    }
}

# ─── 6. Run Prisma migrations ───────────────────────────────────────────────
Write-Step "Running Prisma migrations..."
$backendContainer = docker compose -f docker-compose.prod.yml ps -q backend
if ($backendContainer) {
    docker compose -f docker-compose.prod.yml exec -T backend npx prisma migrate deploy
    if ($LASTEXITCODE -eq 0) {
        Write-Ok "Prisma migrations applied."
    } else {
        Write-Warn "Prisma migrations may have already been applied (this is OK on re-deploy)."
    }
} else {
    Write-Warn "Backend container not yet running. Migrations will run on container start."
}

# ─── 7. Seed (optional) ─────────────────────────────────────────────────────
if ($Seed) {
    Write-Step "Seeding demo data..."
    docker compose -f docker-compose.prod.yml exec -T backend npx prisma db seed
    if ($LASTEXITCODE -eq 0) {
        Write-Ok "Demo data seeded successfully."
    } else {
        Write-Err "Seed failed. Check if data already exists (duplicate key errors are normal on re-seed)."
    }
}

# ─── 8. Health check ────────────────────────────────────────────────────────
Write-Step "Verifying deployment..."
Start-Sleep -Seconds 5

try {
    $response = Invoke-WebRequest -Uri "http://localhost/api/v1/health" -UseBasicParsing -TimeoutSec 10
    if ($response.StatusCode -eq 200) {
        Write-Ok "API health check passed!"
    }
} catch {
    Write-Warn "API not responding yet. It may need a few more seconds to start."
    Write-Warn "Check with: curl http://localhost/api/v1/health"
}

# ─── Done ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " Active Fleet Platform — Deployment Complete" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host " Application:  http://localhost" -ForegroundColor White
Write-Host " API:          http://localhost/api/v1/health" -ForegroundColor White
Write-Host " MSSQL:        localhost:1433 (sa / $($SqlPassword.Substring(0,4))****)" -ForegroundColor White
Write-Host ""
if ($Seed) {
    Write-Host " Demo Login:" -ForegroundColor Yellow
    Write-Host "   Admin:         admin@gthtransport.co.za  /  Demo1234!" -ForegroundColor Yellow
    Write-Host "   Fleet Manager: thabo@gthtransport.co.za  /  Demo1234!" -ForegroundColor Yellow
    Write-Host ""
}
Write-Host " Useful commands:" -ForegroundColor Gray
Write-Host "   docker compose -f docker-compose.prod.yml logs -f          # View logs" -ForegroundColor Gray
Write-Host "   docker compose -f docker-compose.prod.yml ps               # Service status" -ForegroundColor Gray
Write-Host "   .\deploy.ps1 -Down                                         # Stop services" -ForegroundColor Gray
Write-Host "   .\deploy.ps1 -Rebuild                                      # Rebuild & redeploy" -ForegroundColor Gray
Write-Host ""
