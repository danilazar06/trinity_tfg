# ========================================
# TRINITY MVP - SCRIPT DE DESPLIEGUE (PowerShell)
# ========================================

# Configurar política de ejecución para el script actual
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process -Force

# Función para cargar variables de entorno desde .env
function Load-EnvFile {
    param($Path)
    
    if (Test-Path $Path) {
        Write-Host "📋 Cargando variables de entorno desde $Path..." -ForegroundColor Blue
        Get-Content $Path | ForEach-Object {
            if ($_ -match '^([^#][^=]+)=(.*)$') {
                $name = $matches[1].Trim()
                $value = $matches[2].Trim()
                # Remover comillas si existen
                $value = $value -replace '^"(.*)"$', '$1'
                $value = $value -replace "^'(.*)'$", '$1'
                [Environment]::SetEnvironmentVariable($name, $value, "Process")
            }
        }
        return $true
    }
    return $false
}

# Cargar variables de entorno
$envLoaded = $false
if (Test-Path "../.env") {
    $envLoaded = Load-EnvFile "../.env"
} elseif (Test-Path ".env") {
    $envLoaded = Load-EnvFile ".env"
}

if (-not $envLoaded) {
    Write-Host "⚠️  Archivo .env no encontrado. Creando desde .env.example..." -ForegroundColor Yellow
    if (Test-Path "../.env.example") {
        Copy-Item "../.env.example" "../.env"
        Write-Host "✅ Archivo .env creado. Por favor, edítalo con tus credenciales reales y ejecuta el script nuevamente." -ForegroundColor Green
        exit 1
    } else {
        Write-Host "❌ No se encontró .env.example" -ForegroundColor Red
        exit 1
    }
}

Write-Host "🚀 Iniciando despliegue de Trinity MVP..." -ForegroundColor Cyan

# Verificar que estamos en el directorio correcto
if (-not (Test-Path "package.json")) {
    Write-Host "❌ Error: Ejecuta este script desde el directorio infrastructure/" -ForegroundColor Red
    exit 1
}

# Verificar AWS CLI
try {
    aws --version | Out-Null
} catch {
    Write-Host "❌ Error: AWS CLI no está instalado" -ForegroundColor Red
    exit 1
}

# Verificar credenciales AWS
try {
    $account = aws sts get-caller-identity --query Account --output text
    if ($LASTEXITCODE -ne 0) {
        throw "Credenciales no válidas"
    }
} catch {
    Write-Host "❌ Error: Credenciales AWS no configuradas" -ForegroundColor Red
    Write-Host "Ejecuta: aws configure" -ForegroundColor Yellow
    exit 1
}

# Configurar variables de entorno CDK
Write-Host "🔧 Configurando variables de entorno..." -ForegroundColor Blue
if (-not $env:CDK_DEFAULT_ACCOUNT) {
    $env:CDK_DEFAULT_ACCOUNT = $account
}
if (-not $env:CDK_DEFAULT_REGION) {
    $env:CDK_DEFAULT_REGION = if ($env:AWS_DEFAULT_REGION) { $env:AWS_DEFAULT_REGION } else { "us-east-1" }
}

Write-Host "📋 Configuración:" -ForegroundColor Cyan
Write-Host "  - Account: $($env:CDK_DEFAULT_ACCOUNT)" -ForegroundColor White
Write-Host "  - Region: $($env:CDK_DEFAULT_REGION)" -ForegroundColor White

# Verificar variables requeridas
if (-not $env:TMDB_API_KEY -or $env:TMDB_API_KEY -eq "your-tmdb-api-key") {
    Write-Host "⚠️  Advertencia: TMDB_API_KEY no configurada correctamente en .env" -ForegroundColor Yellow
    Write-Host "   Obtén tu API key en: https://www.themoviedb.org/settings/api" -ForegroundColor Yellow
}

if (-not $env:HF_API_TOKEN -or $env:HF_API_TOKEN -eq "hf_your-hugging-face-token") {
    Write-Host "⚠️  Advertencia: HF_API_TOKEN no configurada correctamente en .env" -ForegroundColor Yellow
    Write-Host "   Obtén tu token en: https://huggingface.co/settings/tokens" -ForegroundColor Yellow
}

# Instalar dependencias
Write-Host "📦 Instalando dependencias..." -ForegroundColor Blue
npm install

# Compilar TypeScript
Write-Host "🔨 Compilando proyecto..." -ForegroundColor Blue
npm run build

# Bootstrap CDK (solo si es necesario)
Write-Host "🏗️  Verificando bootstrap de CDK..." -ForegroundColor Blue
try {
    aws cloudformation describe-stacks --stack-name CDKToolkit --region $env:CDK_DEFAULT_REGION | Out-Null
    Write-Host "✅ CDK ya está bootstrapped" -ForegroundColor Green
} catch {
    Write-Host "🏗️  Ejecutando bootstrap de CDK..." -ForegroundColor Blue
    npx cdk bootstrap
}

# Sintetizar stack
Write-Host "🔍 Sintetizando stack..." -ForegroundColor Blue
npx cdk synth

# Desplegar
Write-Host "🚀 Desplegando infraestructura..." -ForegroundColor Blue
npx cdk deploy --all --require-approval never

Write-Host "✅ ¡Despliegue completado!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Próximos pasos:" -ForegroundColor Cyan
Write-Host "1. Copia los outputs del CDK a tu archivo .env del backend" -ForegroundColor White
Write-Host "2. Configura las variables COGNITO_USER_POOL_ID y COGNITO_CLIENT_ID en .env" -ForegroundColor White
Write-Host "3. Ejecuta el backend: cd ../backend && npm run start:dev" -ForegroundColor White