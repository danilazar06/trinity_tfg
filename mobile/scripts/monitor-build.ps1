# Monitorear el progreso del build

Write-Host "📱 MONITOREAR BUILD - Comandos Útiles" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "⚡ COMANDOS PARA MONITOREAR:" -ForegroundColor Yellow
Write-Host ""

Write-Host "# Ver builds en progreso" -ForegroundColor Gray
Write-Host "eas build:list --platform android --limit 5" -ForegroundColor Green

Write-Host ""
Write-Host "# Ver detalles del build actual" -ForegroundColor Gray
Write-Host "eas build:view [BUILD_ID]" -ForegroundColor Green

Write-Host ""
Write-Host "# Ver logs en tiempo real (si tienes el BUILD_ID)" -ForegroundColor Gray
Write-Host "eas build:view [BUILD_ID] --logs" -ForegroundColor Green

Write-Host ""
Write-Host "📱 EXPO DASHBOARD:" -ForegroundColor Yellow
Write-Host "También puedes ver el progreso en:" -ForegroundColor White
Write-Host "https://expo.dev/accounts/trinity-apk/projects/trinity/builds" -ForegroundColor Cyan

Write-Host ""
Write-Host "⏰ TIEMPO ESTIMADO RESTANTE:" -ForegroundColor Yellow
Write-Host "- Build típico: 10-15 minutos" -ForegroundColor White
Write-Host "- Tiempo perfecto para configurar las consolas" -ForegroundColor White

Write-Host ""
Write-Host "✅ CUANDO TERMINE EL BUILD:" -ForegroundColor Green
Write-Host "1. Descargar APK desde Expo Dashboard" -ForegroundColor White
Write-Host "2. Instalar en dispositivo" -ForegroundColor White
Write-Host "3. Esperar 5-10 minutos para propagación de cambios" -ForegroundColor White
Write-Host "4. Probar ambos métodos de autenticación" -ForegroundColor White

Write-Host ""
Write-Host "🎯 RESULTADO ESPERADO:" -ForegroundColor Cyan
Write-Host "- Sin DEVELOPER_ERROR en Google Sign-In ✅" -ForegroundColor White
Write-Host "- Sin USER_PASSWORD_AUTH error en Email/Password ✅" -ForegroundColor White
Write-Host "- Usuarios creados automáticamente en AWS Cognito ✅" -ForegroundColor White