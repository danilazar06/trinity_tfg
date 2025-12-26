# ========================================
# TRINITY MVP - SCRIPT DE INSTALACIÓN (PowerShell)
# ========================================

# Configurar política de ejecución para el script actual
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process -Force

Write-Host "🚀 Iniciando configuración de Trinity MVP..." -ForegroundColor Cyan
Write-Host ""

# Función para imprimir mensajes con color
function Write-Status {
    param($Message)
    Write-Host "[INFO] $Message" -ForegroundColor Blue
}

function Write-Success {
    param($Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Write-Warning {
    param($Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Write-Error {
    param($Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

# Verificar que Node.js está instalado
Write-Status "Verificando Node.js..."
try {
    $nodeVersion = node --version
    $versionNumber = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
    if ($versionNumber -lt 18) {
        Write-Error "Se requiere Node.js 18 o superior. Versión actual: $nodeVersion"
        exit 1
    }
    Write-Success "Node.js $nodeVersion ✓"
} catch {
    Write-Error "Node.js no está instalado. Por favor instala Node.js 18+ desde https://nodejs.org/"
    exit 1
}

# Verificar que npm está instalado
Write-Status "Verificando npm..."
try {
    $npmVersion = npm --version
    Write-Success "npm $npmVersion ✓"
} catch {
    Write-Error "npm no está instalado"
    exit 1
}

# Verificar que AWS CLI está instalado
Write-Status "Verificando AWS CLI..."
try {
    $awsVersion = aws --version
    Write-Success "AWS CLI instalado ✓"
} catch {
    Write-Warning "AWS CLI no está instalado. Instálalo desde https://aws.amazon.com/cli/"
    Write-Warning "Continuando sin AWS CLI..."
}

# Configurar archivo .env
Write-Status "Configurando archivo de entorno..."
if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Success "Archivo .env creado desde .env.example"
        Write-Warning "⚠️  IMPORTANTE: Edita el archivo .env con tus credenciales reales"
    } else {
        Write-Error "No se encontró .env.example"
        exit 1
    }
} else {
    Write-Success "Archivo .env ya existe"
}

# Instalar dependencias del backend
Write-Status "Instalando dependencias del backend..."
Set-Location backend
try {
    npm install
    Write-Success "Dependencias del backend instaladas ✓"
} catch {
    Write-Error "Error instalando dependencias del backend"
    exit 1
}
Set-Location ..

# Instalar dependencias de infrastructure
Write-Status "Instalando dependencias de infrastructure..."
Set-Location infrastructure
try {
    npm install
    Write-Success "Dependencias de infrastructure instaladas ✓"
} catch {
    Write-Error "Error instalando dependencias de infrastructure"
    exit 1
}
Set-Location ..

# Instalar dependencias del mobile (si existe)
if (Test-Path "mobile") {
    Write-Status "Instalando dependencias del mobile..."
    Set-Location mobile
    if (Test-Path "package.json") {
        try {
            npm install
            Write-Success "Dependencias del mobile instaladas ✓"
        } catch {
            Write-Warning "Error instalando dependencias del mobile"
        }
    } else {
        Write-Warning "No se encontró package.json en mobile/"
    }
    Set-Location ..
}

# Verificar archivo .env
Write-Status "Verificando configuración..."
if (Test-Path ".env") {
    $envContent = Get-Content ".env" -Raw
    
    # Verificar que las variables críticas no tengan valores por defecto
    if ($envContent -match "your-") {
        Write-Warning "⚠️  Hay variables en .env que necesitan configuración:"
        $envContent -split "`n" | Where-Object { $_ -match "your-" } | Select-Object -First 5 | ForEach-Object {
            Write-Host "   $_" -ForegroundColor Yellow
        }
        Write-Host ""
        Write-Warning "Por favor, actualiza estas variables con tus credenciales reales"
    }
}

Write-Host ""
Write-Host "🎉 ¡Instalación completada!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Próximos pasos:" -ForegroundColor Cyan
Write-Host "1. Edita el archivo .env con tus credenciales reales:" -ForegroundColor White
Write-Host "   - TMDB_API_KEY: Obtén en https://www.themoviedb.org/settings/api" -ForegroundColor White
Write-Host "   - HF_API_TOKEN: Obtén en https://huggingface.co/settings/tokens" -ForegroundColor White
Write-Host "   - AWS credentials: Configura con 'aws configure'" -ForegroundColor White
Write-Host ""
Write-Host "2. Para desplegar la infraestructura:" -ForegroundColor White
Write-Host "   cd infrastructure && .\deploy.ps1" -ForegroundColor White
Write-Host ""
Write-Host "3. Para ejecutar el backend:" -ForegroundColor White
Write-Host "   cd backend && npm run start:dev" -ForegroundColor White
Write-Host ""
Write-Host "4. Para ejecutar tests:" -ForegroundColor White
Write-Host "   cd backend && npm test" -ForegroundColor White
Write-Host ""
Write-Success "¡Trinity MVP está listo para usar! 🚀"