# Script de despliegue para Trinity MVP (PowerShell)
Write-Host "🚀 Iniciando despliegue de Trinity MVP..." -ForegroundColor Green

# Verificar que estamos en el directorio correcto
if (!(Test-Path "package.json")) {
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

# Configurar variables de entorno
Write-Host "🔧 Configurando variables de entorno..." -ForegroundColor Blue
$env:CDK_DEFAULT_ACCOUNT = $account
$env:CDK_DEFAULT_REGION = if ($env:AWS_DEFAULT_REGION) { $env:AWS_DEFAULT_REGION } else { "us-east-1" }

Write-Host "📋 Configuración:" -ForegroundColor Cyan
Write-Host "  - Account: $($env:CDK_DEFAULT_ACCOUNT)" -ForegroundColor White
Write-Host "  - Region: $($env:CDK_DEFAULT_REGION)" -ForegroundColor White

# Verificar variables requeridas
if (!$env:TMDB_API_KEY) {
    Write-Host "⚠️  Advertencia: TMDB_API_KEY no configurada" -ForegroundColor Yellow
    Write-Host "   Configúrala con: `$env:TMDB_API_KEY='tu-api-key'" -ForegroundColor Yellow
}

if (!$env:HF_API_TOKEN) {
    Write-Host "⚠️  Advertencia: HF_API_TOKEN no configurada" -ForegroundColor Yellow
    Write-Host "   Configúrala con: `$env:HF_API_TOKEN='tu-token'" -ForegroundColor Yellow
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
Write-Host "2. Configura las variables COGNITO_USER_POOL_ID y COGNITO_CLIENT_ID" -ForegroundColor White
Write-Host "3. Ejecuta el backend: cd ../backend && npm run start:dev" -ForegroundColor White