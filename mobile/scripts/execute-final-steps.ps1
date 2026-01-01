# Pasos finales para ejecutar

Write-Host "🚀 EJECUTAR PASOS FINALES" -ForegroundColor Cyan
Write-Host "=========================" -ForegroundColor Cyan

Write-Host ""
Write-Host "📋 ORDEN DE EJECUCIÓN:" -ForegroundColor Yellow
Write-Host ""

Write-Host "1️⃣ CONFIGURAR GOOGLE CLOUD CONSOLE (5 min):" -ForegroundColor Green
Write-Host "   - Ve a: https://console.cloud.google.com/apis/credentials" -ForegroundColor Cyan
Write-Host "   - Busca: 230498169556-cqb6dv3o58oeblrfrk49o0a6l7ecjtrn.apps.googleusercontent.com" -ForegroundColor White
Write-Host "   - Edit > Authorized redirect URIs > Añadir:" -ForegroundColor White
Write-Host "     https://trinity-auth-dev.auth.eu-west-1.amazoncognito.com/oauth2/idpresponse" -ForegroundColor Gray
Write-Host "   - Save" -ForegroundColor White

Write-Host ""
Write-Host "2️⃣ CONFIGURAR AWS COGNITO (5 min):" -ForegroundColor Green
Write-Host "   - Ve a: https://console.aws.amazon.com/cognito/" -ForegroundColor Cyan
Write-Host "   - User Pool: trinity-users-dev" -ForegroundColor White
Write-Host "   - Sign-in experience > Federated identity provider sign-in" -ForegroundColor White
Write-Host "   - Edit Google > Actualizar:" -ForegroundColor White
Write-Host "     * Google app ID: 230498169556-cqb6dv3o58oeblrfrk49o0a6l7ecjtrn.apps.googleusercontent.com" -ForegroundColor Gray
Write-Host "     * Google app secret: [Tu secret copiado]" -ForegroundColor Gray
Write-Host "   - Save" -ForegroundColor White

Write-Host ""
Write-Host "3️⃣ VERIFICAR AUTH FLOWS EN COGNITO:" -ForegroundColor Green
Write-Host "   - App integration > App clients > trinity-mobile-dev" -ForegroundColor White
Write-Host "   - Authentication flows > Verificar habilitados:" -ForegroundColor White
Write-Host "     ✅ ALLOW_USER_PASSWORD_AUTH" -ForegroundColor Gray
Write-Host "     ✅ ALLOW_USER_SRP_AUTH" -ForegroundColor Gray
Write-Host "     ✅ ALLOW_REFRESH_TOKEN_AUTH" -ForegroundColor Gray

Write-Host ""
Write-Host "4️⃣ COMPILAR APK (15 min):" -ForegroundColor Green
Write-Host "   cd mobile" -ForegroundColor Cyan
Write-Host "   eas build --platform android --profile production" -ForegroundColor Cyan

Write-Host ""
Write-Host "5️⃣ INSTALAR Y PROBAR:" -ForegroundColor Green
Write-Host "   - Descargar APK desde Expo Dashboard" -ForegroundColor White
Write-Host "   - Instalar en dispositivo" -ForegroundColor White
Write-Host "   - Probar Google Sign-In (sin DEVELOPER_ERROR)" -ForegroundColor White
Write-Host "   - Probar Email/Password (sin USER_PASSWORD_AUTH error)" -ForegroundColor White

Write-Host ""
Write-Host "⚡ COMANDOS RÁPIDOS:" -ForegroundColor Yellow
Write-Host ""
Write-Host "# Compilar APK" -ForegroundColor Gray
Write-Host "cd mobile && eas build --platform android --profile production" -ForegroundColor Green

Write-Host ""
Write-Host "# Ver builds" -ForegroundColor Gray
Write-Host "eas build:list --platform android" -ForegroundColor Green

Write-Host ""
Write-Host "# Ver credenciales" -ForegroundColor Gray
Write-Host "eas credentials --platform android" -ForegroundColor Green

Write-Host ""
Write-Host "✅ CONFIGURACIÓN LISTA:" -ForegroundColor Cyan
Write-Host "- Archivos de código actualizados ✅" -ForegroundColor White
Write-Host "- Web Client ID configurado ✅" -ForegroundColor White
Write-Host "- Android Client ID mantenido ✅" -ForegroundColor White
Write-Host "- SHA-1 se mantendrá igual ✅" -ForegroundColor White

Write-Host ""
Write-Host "🎯 OBJETIVO:" -ForegroundColor Red
Write-Host "Resolver ambos errores:" -ForegroundColor White
Write-Host "- DEVELOPER_ERROR (Google Sign-In)" -ForegroundColor White
Write-Host "- USER_PASSWORD_AUTH flow not enabled (Email/Password)" -ForegroundColor White