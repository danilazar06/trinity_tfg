# Script para redesplegar infraestructura con correcciones de Cognito

Write-Host "🚀 REDESPLEGAR INFRAESTRUCTURA - Corrección Cognito" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "🔧 CAMBIOS REALIZADOS EN CDK:" -ForegroundColor Yellow
Write-Host "- Añadido adminUserPassword: true" -ForegroundColor Green
Write-Host "- Añadido custom: true" -ForegroundColor Green
Write-Host "- Configurado refreshTokenValidity: 30 días" -ForegroundColor Green
Write-Host "- Configurado accessTokenValidity: 1 hora" -ForegroundColor Green
Write-Host "- Configurado idTokenValidity: 1 hora" -ForegroundColor Green

Write-Host ""
Write-Host "📋 PASOS PARA REDESPLEGAR:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Ve al directorio de infraestructura:" -ForegroundColor White
Write-Host "   cd infrastructure" -ForegroundColor Cyan
Write-Host ""
Write-Host "2. Instala dependencias (si es necesario):" -ForegroundColor White
Write-Host "   npm install" -ForegroundColor Cyan
Write-Host ""
Write-Host "3. Compila el proyecto:" -ForegroundColor White
Write-Host "   npm run build" -ForegroundColor Cyan
Write-Host ""
Write-Host "4. Despliega los cambios:" -ForegroundColor White
Write-Host "   cdk deploy" -ForegroundColor Cyan
Write-Host ""
Write-Host "5. Confirma cuando CDK pregunte (Y/yes)" -ForegroundColor White

Write-Host ""
Write-Host "⏰ TIEMPO ESTIMADO:" -ForegroundColor Yellow
Write-Host "- Despliegue: 5-10 minutos" -ForegroundColor White
Write-Host "- Propagación: 5-10 minutos adicionales" -ForegroundColor White

Write-Host ""
Write-Host "🧪 DESPUÉS DEL DESPLIEGUE:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Espera 10-15 minutos para propagación completa" -ForegroundColor White
Write-Host "2. Prueba login con email/password:" -ForegroundColor White
Write-Host "   - Usuario: prueba@prueba.com" -ForegroundColor Gray
Write-Host "   - El error USER_PASSWORD_AUTH debería desaparecer" -ForegroundColor Gray
Write-Host "3. Prueba Google Sign-In:" -ForegroundColor White
Write-Host "   - Verifica que el DEVELOPER_ERROR se resuelva" -ForegroundColor Gray

Write-Host ""
Write-Host "❗ IMPORTANTE:" -ForegroundColor Red
Write-Host "- El redespliegue actualizará la configuración del User Pool Client" -ForegroundColor White
Write-Host "- No afectará a los usuarios existentes en Cognito" -ForegroundColor White
Write-Host "- Los IDs y configuraciones principales se mantendrán" -ForegroundColor White

Write-Host ""
Write-Host "🔍 SI EL PROBLEMA PERSISTE:" -ForegroundColor Yellow
Write-Host "Después del redespliegue, verifica manualmente en AWS Console:" -ForegroundColor White
Write-Host "- User Pool: trinity-users-dev" -ForegroundColor Gray
Write-Host "- App Client: trinity-mobile-dev" -ForegroundColor Gray
Write-Host "- Authentication flows habilitados" -ForegroundColor Gray
Write-Host "- Identity providers configurados" -ForegroundColor Gray

Write-Host ""
Write-Host "🚀 COMANDOS RÁPIDOS:" -ForegroundColor Cyan
Write-Host "cd infrastructure && npm run build && cdk deploy" -ForegroundColor Green