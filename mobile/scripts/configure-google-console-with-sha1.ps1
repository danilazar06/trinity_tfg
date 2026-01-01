# Configuración de Google Cloud Console con SHA-1 Fingerprint
# SHA-1 obtenido automáticamente del debug keystore

$SHA1_FINGERPRINT = "1E:EC:B4:93:57:2B:3C:A7:A4:8B:86:09:32:44:D3:C2:DA:86:78:97"
$ANDROID_CLIENT_ID = "230498169556-ipt2iafpd75h17kjcsgmb89oc9u1ciii.apps.googleusercontent.com"
$WEB_CLIENT_ID = "230498169556-cqb6dv3o58oeblrfrk49o0a6l7ecjtrn.apps.googleusercontent.com"
$PACKAGE_NAME = "com.trinity.app"
$COGNITO_REDIRECT_URI = "https://trinity-auth-dev.auth.eu-west-1.amazoncognito.com/oauth2/idpresponse"

Write-Host "🔧 CONFIGURACIÓN AUTOMÁTICA DE GOOGLE CLOUD CONSOLE" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "✅ SHA-1 Fingerprint obtenido automáticamente:" -ForegroundColor Green
Write-Host "   $SHA1_FINGERPRINT" -ForegroundColor Yellow

Write-Host ""
Write-Host "📋 INFORMACIÓN DE CONFIGURACIÓN:" -ForegroundColor Yellow
Write-Host "   Android Client ID: $ANDROID_CLIENT_ID" -ForegroundColor Gray
Write-Host "   Web Client ID: $WEB_CLIENT_ID" -ForegroundColor Gray
Write-Host "   Package Name: $PACKAGE_NAME" -ForegroundColor Gray
Write-Host "   Cognito Redirect URI: $COGNITO_REDIRECT_URI" -ForegroundColor Gray

# Copiar SHA-1 al clipboard
try {
    $SHA1_FINGERPRINT | Set-Clipboard
    Write-Host ""
    Write-Host "📋 SHA-1 copiado al clipboard automáticamente" -ForegroundColor Green
} catch {
    Write-Host ""
    Write-Host "📋 Copia manualmente el SHA-1 de arriba" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🌐 ABRIENDO GOOGLE CLOUD CONSOLE..." -ForegroundColor Cyan

# Abrir Google Cloud Console automáticamente
try {
    Start-Process "https://console.cloud.google.com/apis/credentials"
    Write-Host "✅ Google Cloud Console abierto en el navegador" -ForegroundColor Green
} catch {
    Write-Host "⚠️ Abre manualmente: https://console.cloud.google.com/apis/credentials" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🔧 PASOS A SEGUIR EN GOOGLE CLOUD CONSOLE:" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green

Write-Host ""
Write-Host "PASO 1: Configurar Android Client ID" -ForegroundColor Yellow
Write-Host "1. Busca en la lista este Client ID:" -ForegroundColor White
Write-Host "   $ANDROID_CLIENT_ID" -ForegroundColor Cyan
Write-Host "2. Haz clic en el ícono de EDITAR (lápiz) al lado" -ForegroundColor White
Write-Host "3. Verifica que 'Package name' sea: $PACKAGE_NAME" -ForegroundColor White
Write-Host "4. En 'SHA certificate fingerprints', AÑADE este SHA-1:" -ForegroundColor White
Write-Host "   $SHA1_FINGERPRINT" -ForegroundColor Yellow
Write-Host "5. Haz clic en 'SAVE' o 'GUARDAR'" -ForegroundColor White

Write-Host ""
Write-Host "PASO 2: Verificar Web Client ID" -ForegroundColor Yellow
Write-Host "1. Busca en la lista este Client ID:" -ForegroundColor White
Write-Host "   $WEB_CLIENT_ID" -ForegroundColor Cyan
Write-Host "2. Haz clic en el ícono de EDITAR (lápiz)" -ForegroundColor White
Write-Host "3. En 'Authorized redirect URIs', verifica que contenga:" -ForegroundColor White
Write-Host "   $COGNITO_REDIRECT_URI" -ForegroundColor Yellow
Write-Host "4. Si no está, añádela y haz clic en 'SAVE'" -ForegroundColor White

Write-Host ""
Write-Host "✅ VERIFICACIÓN FINAL:" -ForegroundColor Green
Write-Host "Después de guardar ambos Client IDs, verifica que:" -ForegroundColor White
Write-Host "- Android Client ID tiene el SHA-1 fingerprint correcto" -ForegroundColor Gray
Write-Host "- Android Client ID tiene el package name correcto" -ForegroundColor Gray
Write-Host "- Web Client ID tiene la redirect URI de Cognito" -ForegroundColor Gray

Write-Host ""
Write-Host "⏰ TIEMPO DE PROPAGACIÓN:" -ForegroundColor Red
Write-Host "Los cambios pueden tardar hasta 5-10 minutos en propagarse" -ForegroundColor White
Write-Host "Sé paciente antes de probar la aplicación" -ForegroundColor White

Write-Host ""
Write-Host "🚀 DESPUÉS DE CONFIGURAR:" -ForegroundColor Cyan
Write-Host "1. Espera 5-10 minutos" -ForegroundColor White
Write-Host "2. Ejecuta: npx expo start --clear" -ForegroundColor Cyan
Write-Host "3. Abre la app en Android" -ForegroundColor White
Write-Host "4. Prueba Google Sign-In" -ForegroundColor White
Write-Host "5. El error DEVELOPER_ERROR debería desaparecer" -ForegroundColor Green

Write-Host ""
Write-Host "📞 SI NECESITAS AYUDA:" -ForegroundColor Yellow
Write-Host "- SHA-1 está en el clipboard, solo pégalo" -ForegroundColor Gray
Write-Host "- Los Client IDs están listados arriba" -ForegroundColor Gray
Write-Host "- Package name debe ser exactamente: $PACKAGE_NAME" -ForegroundColor Gray
Write-Host "- Redirect URI debe ser exactamente como se muestra" -ForegroundColor Gray

Write-Host ""
Write-Host "🎯 RESULTADO ESPERADO:" -ForegroundColor Green
Write-Host "Google Sign-In funcionará sin el 'mensaje grande sobre fondo blanco'" -ForegroundColor White
Write-Host "La autenticación será fluida y sin errores DEVELOPER_ERROR" -ForegroundColor White

Write-Host ""
Write-Host "⚠️ RECORDATORIO IMPORTANTE:" -ForegroundColor Red
Write-Host "Este SHA-1 es para DESARROLLO (debug keystore)" -ForegroundColor White
Write-Host "Para producción necesitarás el SHA-1 del keystore de release" -ForegroundColor White