# Script para crear Android Client ID en Google Cloud Console

Write-Host "🔧 Crear Android Client ID en Google Cloud Console" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "📋 INFORMACIÓN OBTENIDA:" -ForegroundColor Yellow
Write-Host "- SHA1 Fingerprint: CA:C8:5F:F0:D4:81:27:7C:21:75:94:CD:E1:C3:7E:E9:98:09:93:D7" -ForegroundColor Green
Write-Host "- Package Name: com.trinity.app" -ForegroundColor Green
Write-Host "- Project: trinity-app-production" -ForegroundColor Green

Write-Host ""
Write-Host "🌐 PASOS EN GOOGLE CLOUD CONSOLE:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Ve a: https://console.cloud.google.com/" -ForegroundColor White
Write-Host "2. Selecciona proyecto: trinity-app-production" -ForegroundColor White
Write-Host "3. Ve a 'APIs & Services' > 'Credentials'" -ForegroundColor White
Write-Host "4. Haz clic '+ CREATE CREDENTIALS' > 'OAuth 2.0 Client ID'" -ForegroundColor White

Write-Host ""
Write-Host "5. Configura el NUEVO Client ID:" -ForegroundColor White
Write-Host "   - Application type: Android" -ForegroundColor Gray
Write-Host "   - Name: Trinity Android App" -ForegroundColor Gray
Write-Host "   - Package name: com.trinity.app" -ForegroundColor Gray
Write-Host "   - SHA-1 certificate fingerprint: CA:C8:5F:F0:D4:81:27:7C:21:75:94:CD:E1:C3:7E:E9:98:09:93:D7" -ForegroundColor Gray

Write-Host ""
Write-Host "6. Haz clic 'CREATE'" -ForegroundColor White

Write-Host ""
Write-Host "7. COPIA el nuevo Android Client ID generado" -ForegroundColor White
Write-Host "   (será diferente al Web Client ID que ya tienes)" -ForegroundColor Gray

Write-Host ""
Write-Host "📋 DESPUÉS DE CREAR EL ANDROID CLIENT ID:" -ForegroundColor Yellow
Write-Host ""
Write-Host "Ejecuta este comando con el nuevo Android Client ID:" -ForegroundColor White
Write-Host ".\mobile\scripts\update-google-services.ps1 -AndroidClientId 'NUEVO_ANDROID_CLIENT_ID' -SHA1Fingerprint 'CA:C8:5F:F0:D4:81:27:7C:21:75:94:CD:E1:C3:7E:E9:98:09:93:D7'" -ForegroundColor Cyan

Write-Host ""
Write-Host "🔍 IMPORTANTE:" -ForegroundColor Red
Write-Host "- El Web Client ID (320120465080-4lf6l426q4ct2jn4mpgte9m5mbmlss7j.apps.googleusercontent.com) ya está correcto" -ForegroundColor White
Write-Host "- Necesitas crear un ANDROID Client ID ADICIONAL con el SHA-1" -ForegroundColor White
Write-Host "- Ambos Client IDs coexistirán en el mismo proyecto de Google" -ForegroundColor White

Write-Host ""
Write-Host "✅ RESULTADO ESPERADO:" -ForegroundColor Green
Write-Host "- DEVELOPER_ERROR desaparecerá" -ForegroundColor White
Write-Host "- Google Sign-In funcionará correctamente" -ForegroundColor White
Write-Host "- Los usuarios se crearán en AWS Cognito automáticamente" -ForegroundColor White