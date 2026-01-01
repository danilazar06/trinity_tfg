# Script para actualizar google-services.json con credenciales reales

param(
    [Parameter(Mandatory=$true)]
    [string]$AndroidClientId,
    
    [Parameter(Mandatory=$true)]
    [string]$SHA1Fingerprint
)

Write-Host "🔧 Actualizando google-services.json..." -ForegroundColor Cyan

# Validar parámetros
if (-not $AndroidClientId.Contains("apps.googleusercontent.com")) {
    Write-Host "❌ Error: AndroidClientId debe terminar en .apps.googleusercontent.com" -ForegroundColor Red
    exit 1
}

if (-not $SHA1Fingerprint.Contains(":")) {
    Write-Host "❌ Error: SHA1Fingerprint debe tener formato XX:XX:XX:XX:..." -ForegroundColor Red
    exit 1
}

# Convertir SHA-1 a formato hash (sin : y en minúsculas)
$certificateHash = $SHA1Fingerprint.Replace(":", "").ToLower()

Write-Host "📋 Configuración:" -ForegroundColor Yellow
Write-Host "- Android Client ID: $AndroidClientId" -ForegroundColor White
Write-Host "- SHA-1 Fingerprint: $SHA1Fingerprint" -ForegroundColor White
Write-Host "- Certificate Hash: $certificateHash" -ForegroundColor White

# Leer google-services.json actual
$googleServicesPath = "mobile/google-services.json"
if (-not (Test-Path $googleServicesPath)) {
    Write-Host "❌ Error: No se encontró $googleServicesPath" -ForegroundColor Red
    exit 1
}

try {
    $googleServices = Get-Content $googleServicesPath -Raw | ConvertFrom-Json
    
    # Buscar y actualizar el cliente Android (client_type: 1)
    $androidClient = $googleServices.client[0].oauth_client | Where-Object { $_.client_type -eq 1 }
    
    if ($androidClient) {
        Write-Host "✅ Cliente Android encontrado, actualizando..." -ForegroundColor Green
        
        # Actualizar Client ID
        $androidClient.client_id = $AndroidClientId
        
        # Actualizar Certificate Hash
        $androidClient.android_info.certificate_hash = $certificateHash
        
        # Guardar archivo actualizado
        $googleServices | ConvertTo-Json -Depth 10 | Set-Content $googleServicesPath
        
        Write-Host "✅ google-services.json actualizado correctamente!" -ForegroundColor Green
        
        Write-Host ""
        Write-Host "🔍 Cambios realizados:" -ForegroundColor Cyan
        Write-Host "- Client ID: $AndroidClientId" -ForegroundColor White
        Write-Host "- Certificate Hash: $certificateHash" -ForegroundColor White
        
        Write-Host ""
        Write-Host "🚀 Próximos pasos:" -ForegroundColor Yellow
        Write-Host "1. Ejecuta: eas build --platform android --profile production" -ForegroundColor White
        Write-Host "2. Instala el nuevo APK en tu dispositivo" -ForegroundColor White
        Write-Host "3. Prueba Google Sign-In (el DEVELOPER_ERROR debería desaparecer)" -ForegroundColor White
        
    } else {
        Write-Host "❌ Error: No se encontró cliente Android en google-services.json" -ForegroundColor Red
        exit 1
    }
    
} catch {
    Write-Host "❌ Error procesando google-services.json: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ Configuración completada!" -ForegroundColor Green