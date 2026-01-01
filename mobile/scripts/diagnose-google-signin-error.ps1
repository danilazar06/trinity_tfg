# Diagnóstico y Solución del Error de Google Sign-In
# Este script ayuda a diagnosticar y resolver el "mensaje grande sobre fondo blanco"

Write-Host "🔍 DIAGNÓSTICO DE GOOGLE SIGN-IN ERROR" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "📋 PROBLEMA IDENTIFICADO:" -ForegroundColor Yellow
Write-Host "El 'mensaje grande sobre fondo blanco' es muy probablemente el error DEVELOPER_ERROR" -ForegroundColor White
Write-Host "Este error ocurre cuando la configuración de Google Cloud Console no coincide con la app" -ForegroundColor White

Write-Host ""
Write-Host "🔍 VERIFICANDO CONFIGURACIÓN ACTUAL..." -ForegroundColor Yellow

# Leer configuración actual
$appJsonPath = "app.json"
if (Test-Path $appJsonPath) {
    $appJson = Get-Content $appJsonPath | ConvertFrom-Json
    $webClientId = $appJson.expo.extra.googleWebClientId
    $androidClientId = $appJson.expo.extra.googleAndroidClientId
    $packageName = $appJson.expo.android.package
    
    Write-Host "✅ Configuración encontrada en app.json:" -ForegroundColor Green
    Write-Host "   - Package Name: $packageName" -ForegroundColor Gray
    Write-Host "   - Web Client ID: $webClientId" -ForegroundColor Gray
    Write-Host "   - Android Client ID: $androidClientId" -ForegroundColor Gray
} else {
    Write-Host "❌ No se encontró app.json" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🚨 CAUSAS PRINCIPALES DEL DEVELOPER_ERROR:" -ForegroundColor Red
Write-Host "1. SHA-1 fingerprint no configurado en Google Cloud Console" -ForegroundColor White
Write-Host "2. Package name incorrecto (debe ser: com.trinity.app)" -ForegroundColor White
Write-Host "3. Client IDs incorrectos o mal configurados" -ForegroundColor White
Write-Host "4. Configuración de OAuth consent screen incompleta" -ForegroundColor White

Write-Host ""
Write-Host "🔧 SOLUCIÓN PASO A PASO:" -ForegroundColor Green
Write-Host "========================" -ForegroundColor Green

Write-Host ""
Write-Host "PASO 1: Obtener SHA-1 Fingerprint" -ForegroundColor Yellow
Write-Host "Ejecuta este comando para obtener el SHA-1:" -ForegroundColor White
Write-Host "keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android" -ForegroundColor Cyan

Write-Host ""
Write-Host "PASO 2: Configurar Google Cloud Console" -ForegroundColor Yellow
Write-Host "1. Ve a: https://console.cloud.google.com/apis/credentials" -ForegroundColor White
Write-Host "2. Busca tu Android Client ID: $androidClientId" -ForegroundColor White
Write-Host "3. Haz clic en EDITAR (ícono de lápiz)" -ForegroundColor White
Write-Host "4. En 'SHA certificate fingerprints', AÑADE el SHA-1 que obtuviste" -ForegroundColor White
Write-Host "5. Verifica que 'Package name' sea: com.trinity.app" -ForegroundColor White
Write-Host "6. Haz clic en SAVE" -ForegroundColor White

Write-Host ""
Write-Host "PASO 3: Configurar Web Client ID" -ForegroundColor Yellow
Write-Host "1. En la misma página, busca tu Web Client ID: $webClientId" -ForegroundColor White
Write-Host "2. Haz clic en EDITAR" -ForegroundColor White
Write-Host "3. En 'Authorized redirect URIs', asegúrate de tener:" -ForegroundColor White
Write-Host "   https://trinity-auth-dev.auth.eu-west-1.amazoncognito.com/oauth2/idpresponse" -ForegroundColor Green
Write-Host "4. Haz clic en SAVE" -ForegroundColor White

Write-Host ""
Write-Host "PASO 4: Verificar OAuth Consent Screen" -ForegroundColor Yellow
Write-Host "1. Ve a: https://console.cloud.google.com/apis/credentials/consent" -ForegroundColor White
Write-Host "2. Asegúrate de que la app esté configurada correctamente" -ForegroundColor White
Write-Host "3. Verifica que el dominio esté autorizado si es necesario" -ForegroundColor White

Write-Host ""
Write-Host "PASO 5: Limpiar y Reconstruir" -ForegroundColor Yellow
Write-Host "Después de hacer los cambios en Google Cloud Console:" -ForegroundColor White
Write-Host "1. npx expo start --clear" -ForegroundColor Cyan
Write-Host "2. Presiona 'a' para abrir en Android" -ForegroundColor Cyan
Write-Host "3. Prueba Google Sign-In nuevamente" -ForegroundColor Cyan

Write-Host ""
Write-Host "⚠️ IMPORTANTE:" -ForegroundColor Red
Write-Host "Los cambios en Google Cloud Console pueden tardar hasta 5 minutos en propagarse" -ForegroundColor White
Write-Host "Si el error persiste, espera unos minutos y vuelve a intentar" -ForegroundColor White

Write-Host ""
Write-Host "🔍 COMANDOS ÚTILES PARA DEBUGGING:" -ForegroundColor Cyan
Write-Host "# Ver logs de la app en tiempo real:" -ForegroundColor Gray
Write-Host "npx expo logs --platform android" -ForegroundColor Cyan
Write-Host ""
Write-Host "# Limpiar caché completamente:" -ForegroundColor Gray
Write-Host "npx expo start --clear --reset-cache" -ForegroundColor Cyan

Write-Host ""
Write-Host "📞 SI EL PROBLEMA PERSISTE:" -ForegroundColor Yellow
Write-Host "1. Verifica que el proyecto de Google Cloud Console sea el correcto" -ForegroundColor White
Write-Host "2. Asegúrate de estar usando las credenciales correctas" -ForegroundColor White
Write-Host "3. Revisa que no haya múltiples configuraciones conflictivas" -ForegroundColor White
Write-Host "4. Considera crear un nuevo Android Client ID si es necesario" -ForegroundColor White

Write-Host ""
Write-Host "✅ CONFIGURACIÓN CORRECTA ESPERADA:" -ForegroundColor Green
Write-Host "- Package name: com.trinity.app" -ForegroundColor Gray
Write-Host "- SHA-1 fingerprint: [tu fingerprint de debug]" -ForegroundColor Gray
Write-Host "- Web Client ID configurado con redirect URI de Cognito" -ForegroundColor Gray
Write-Host "- Android Client ID configurado con package name y SHA-1" -ForegroundColor Gray

Write-Host ""
Write-Host "🎯 RESULTADO ESPERADO:" -ForegroundColor Green
Write-Host "Después de seguir estos pasos, Google Sign-In debería funcionar sin el error DEVELOPER_ERROR" -ForegroundColor White
Write-Host "y no deberías ver más el 'mensaje grande sobre fondo blanco'" -ForegroundColor White