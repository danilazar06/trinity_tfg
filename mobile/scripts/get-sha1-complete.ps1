# Script completo para obtener SHA-1 y configurar Google Cloud Console

Write-Host "🔍 TRINITY - Obtener SHA-1 y Configurar Google Sign-In" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "📋 PASO 1: Obtener SHA-1 Fingerprint" -ForegroundColor Yellow
Write-Host ""

# Método 1: Expo Dashboard
Write-Host "🌐 MÉTODO 1: Expo Dashboard (RECOMENDADO)" -ForegroundColor Green
Write-Host "1. Ve a: https://expo.dev/accounts/trinity-apk/projects/trinity/builds" -ForegroundColor White
Write-Host "2. Busca tu último build de Android (el más reciente)" -ForegroundColor White
Write-Host "3. Haz clic en el build para ver detalles" -ForegroundColor White
Write-Host "4. Busca 'Certificate fingerprint' o 'SHA-1'" -ForegroundColor White
Write-Host "5. Copia el valor SHA-1 (formato: XX:XX:XX:XX:...)" -ForegroundColor White

Write-Host ""
Write-Host "⚡ MÉTODO 2: EAS CLI" -ForegroundColor Green
Write-Host "Ejecuta en terminal: eas credentials --platform android" -ForegroundColor White
Write-Host "Busca la línea que dice 'SHA1: [fingerprint]'" -ForegroundColor White

Write-Host ""
Write-Host "🔧 MÉTODO 3: Desde APK (si tienes Java/keytool)" -ForegroundColor Green

# Verificar si keytool está disponible
try {
    $keytoolVersion = keytool -help 2>$null
    if ($keytoolVersion) {
        Write-Host "✅ keytool disponible" -ForegroundColor Green
        
        # Buscar APK
        $apkFiles = Get-ChildItem -Path "." -Filter "*.apk" -Recurse | Select-Object -First 5
        if ($apkFiles) {
            Write-Host "📱 APKs encontrados:" -ForegroundColor Cyan
            foreach ($apk in $apkFiles) {
                Write-Host "   - $($apk.FullName)" -ForegroundColor Gray
            }
            Write-Host ""
            Write-Host "Para extraer SHA-1 de un APK:" -ForegroundColor White
            Write-Host "keytool -printcert -jarfile [ruta-al-apk] | findstr SHA1" -ForegroundColor Gray
        } else {
            Write-Host "⚠️ No se encontraron archivos APK" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "⚠️ keytool no disponible (necesitas Java JDK)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "📋 PASO 2: Configurar Google Cloud Console" -ForegroundColor Yellow
Write-Host ""

Write-Host "🌐 Una vez que tengas el SHA-1, ve a:" -ForegroundColor White
Write-Host "   https://console.cloud.google.com/" -ForegroundColor Cyan

Write-Host ""
Write-Host "🔧 Configuración paso a paso:" -ForegroundColor White
Write-Host "1. Selecciona proyecto: trinity-app-production" -ForegroundColor Gray
Write-Host "2. Ve a 'APIs & Services' > 'Credentials'" -ForegroundColor Gray
Write-Host "3. Haz clic '+ CREATE CREDENTIALS' > 'OAuth 2.0 Client ID'" -ForegroundColor Gray
Write-Host "4. Configura:" -ForegroundColor Gray
Write-Host "   - Application type: Android" -ForegroundColor Gray
Write-Host "   - Name: Trinity Android App" -ForegroundColor Gray
Write-Host "   - Package name: com.trinity.app" -ForegroundColor Gray
Write-Host "   - SHA-1 certificate fingerprint: [EL QUE OBTUVISTE]" -ForegroundColor Gray
Write-Host "5. Haz clic 'CREATE'" -ForegroundColor Gray
Write-Host "6. COPIA el Client ID generado (será algo como:" -ForegroundColor Gray
Write-Host "   320120465080-xxxxxxxxxxxxxxxxx.apps.googleusercontent.com)" -ForegroundColor Gray

Write-Host ""
Write-Host "📋 PASO 3: Actualizar google-services.json" -ForegroundColor Yellow
Write-Host ""

Write-Host "🔧 Necesitas actualizar mobile/google-services.json:" -ForegroundColor White
Write-Host "1. Busca la sección 'oauth_client' con 'client_type': 1" -ForegroundColor Gray
Write-Host "2. Reemplaza 'client_id' con el nuevo Client ID de Google Cloud Console" -ForegroundColor Gray
Write-Host "3. Actualiza 'certificate_hash' con el SHA-1 (sin los ':' y en minúsculas)" -ForegroundColor Gray

Write-Host ""
Write-Host "📋 PASO 4: Recompilar APK" -ForegroundColor Yellow
Write-Host ""

Write-Host "🚀 Ejecuta:" -ForegroundColor White
Write-Host "   eas build --platform android --profile production" -ForegroundColor Cyan

Write-Host ""
Write-Host "🔍 INFORMACIÓN ACTUAL:" -ForegroundColor Cyan
Write-Host "- Package name: com.trinity.app" -ForegroundColor White
Write-Host "- Project number: 320120465080" -ForegroundColor White
Write-Host "- Web Client ID: 320120465080-4lf6l426q4ct2jn4mpgte9m5mbmlss7j.apps.googleusercontent.com" -ForegroundColor White
Write-Host "- Android Client ID actual: PLACEHOLDER (necesita ser reemplazado)" -ForegroundColor Red

Write-Host ""
Write-Host "❗ IMPORTANTE:" -ForegroundColor Red
Write-Host "El Android Client ID actual es un placeholder." -ForegroundColor White
Write-Host "Necesitas crear uno REAL en Google Cloud Console con el SHA-1 correcto." -ForegroundColor White

Write-Host ""
Write-Host "🎯 DESPUÉS DE CONFIGURAR:" -ForegroundColor Green
Write-Host "1. El DEVELOPER_ERROR debería desaparecer" -ForegroundColor White
Write-Host "2. Google Sign-In funcionará correctamente" -ForegroundColor White
Write-Host "3. La autenticación con AWS Cognito será exitosa" -ForegroundColor White

Write-Host ""
Write-Host "💡 ¿Necesitas ayuda?" -ForegroundColor Cyan
Write-Host "Comparte el SHA-1 que obtengas y te ayudo a actualizar google-services.json" -ForegroundColor White