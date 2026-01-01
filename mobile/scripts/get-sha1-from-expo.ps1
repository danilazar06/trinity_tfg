# Script para obtener SHA-1 fingerprint desde Expo Dashboard

Write-Host "🔍 Obteniendo SHA-1 fingerprint desde Expo..." -ForegroundColor Cyan

Write-Host ""
Write-Host "📋 MÉTODO 1: Expo Dashboard (Recomendado)" -ForegroundColor Yellow
Write-Host "1. Ve a: https://expo.dev/accounts/trinity-apk/projects/trinity/builds" -ForegroundColor White
Write-Host "2. Busca tu último build de Android (el más reciente)" -ForegroundColor White
Write-Host "3. Haz clic en el build para ver detalles" -ForegroundColor White
Write-Host "4. Busca 'Certificate fingerprint' o 'SHA-1'" -ForegroundColor White
Write-Host "5. Copia el valor SHA-1" -ForegroundColor White

Write-Host ""
Write-Host "📋 MÉTODO 2: EAS CLI" -ForegroundColor Yellow
Write-Host "Ejecuta: eas credentials --platform android" -ForegroundColor White
Write-Host "Busca la línea que dice 'SHA1: [fingerprint]'" -ForegroundColor White

Write-Host ""
Write-Host "📋 MÉTODO 3: Desde APK con OpenSSL (si está disponible)" -ForegroundColor Yellow

# Verificar si tenemos el APK temporal
if (Test-Path "trinity-temp.apk") {
    Write-Host "✅ APK temporal encontrado" -ForegroundColor Green
    
    # Intentar con OpenSSL si está disponible
    try {
        $null = openssl version 2>$null
        Write-Host "✅ OpenSSL disponible, intentando extraer certificado..." -ForegroundColor Green
        
        # Extraer certificado con OpenSSL
        $cert = openssl pkcs7 -inform DER -in trinity-temp.apk -print_certs 2>$null
        if ($cert) {
            Write-Host "🔐 Certificado extraído con OpenSSL" -ForegroundColor Green
            Write-Host $cert
        }
    } catch {
        Write-Host "⚠️ OpenSSL no disponible" -ForegroundColor Yellow
    }
} else {
    Write-Host "⚠️ APK temporal no encontrado" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🎯 UNA VEZ QUE TENGAS EL SHA-1:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Ve a Google Cloud Console:" -ForegroundColor White
Write-Host "   https://console.cloud.google.com/" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Selecciona proyecto: trinity-app-production" -ForegroundColor White
Write-Host ""
Write-Host "3. Ve a 'APIs & Services' > 'Credentials'" -ForegroundColor White
Write-Host ""
Write-Host "4. Crea NUEVO 'OAuth 2.0 Client ID':" -ForegroundColor White
Write-Host "   - Application type: Android" -ForegroundColor Gray
Write-Host "   - Name: Trinity Android App" -ForegroundColor Gray
Write-Host "   - Package name: com.trinity.app" -ForegroundColor Gray
Write-Host "   - SHA-1 certificate fingerprint: [EL QUE OBTENGAS]" -ForegroundColor Gray
Write-Host ""
Write-Host "5. Haz clic 'Create'" -ForegroundColor White
Write-Host ""
Write-Host "6. COPIA EL CLIENT ID generado (será algo como:" -ForegroundColor White
Write-Host "   320120465080-xxxxxxxxxxxxxxxxx.apps.googleusercontent.com)" -ForegroundColor Gray
Write-Host ""
Write-Host "7. Actualiza google-services.json:" -ForegroundColor White
Write-Host "   - Reemplaza el Client ID de type 1 (Android)" -ForegroundColor Gray
Write-Host "   - Mantén el Client ID de type 3 (Web)" -ForegroundColor Gray
Write-Host ""
Write-Host "8. Recompila APK con: eas build --platform android --profile production" -ForegroundColor White

Write-Host ""
Write-Host "🔍 INFORMACIÓN ACTUAL:" -ForegroundColor Cyan
Write-Host "- Package name: com.trinity.app" -ForegroundColor White
Write-Host "- Project number: 320120465080" -ForegroundColor White
Write-Host "- Web Client ID: 320120465080-4lf6l426q4ct2jn4mpgte9m5mbmlss7j.apps.googleusercontent.com" -ForegroundColor White
Write-Host "- Android Client ID actual: 320120465080-android-specific-client-id.apps.googleusercontent.com (PLACEHOLDER)" -ForegroundColor Red

Write-Host ""
Write-Host "❗ IMPORTANTE:" -ForegroundColor Red
Write-Host "El Android Client ID actual es un placeholder." -ForegroundColor White
Write-Host "Necesitas crear uno REAL en Google Cloud Console con el SHA-1 correcto." -ForegroundColor White