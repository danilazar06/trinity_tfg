# Script para corregir el esquema GraphQL y redesplegar

Write-Host "🔧 CORREGIR ESQUEMA GRAPHQL - Redesplegar Infraestructura" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "❌ PROBLEMA IDENTIFICADO:" -ForegroundColor Red
Write-Host "El esquema GraphQL está incompleto:" -ForegroundColor White
Write-Host "- Falta CreateRoomInput type" -ForegroundColor Gray
Write-Host "- Faltan campos en Room type (name, description, etc.)" -ForegroundColor Gray
Write-Host "- Mutaciones sin parámetros correctos" -ForegroundColor Gray

Write-Host ""
Write-Host "✅ CORRECCIONES APLICADAS:" -ForegroundColor Green
Write-Host "- Añadido CreateRoomInput, JoinRoomInput, VoteInput" -ForegroundColor White
Write-Host "- Completado Room type con todos los campos" -ForegroundColor White
Write-Host "- Añadido User type y Genre type" -ForegroundColor White
Write-Host "- Corregidas mutaciones con parámetros correctos" -ForegroundColor White
Write-Host "- Actualizadas queries GraphQL en aws-config.ts" -ForegroundColor White

Write-Host ""
Write-Host "🚀 PASOS PARA REDESPLEGAR:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Ve al directorio de infraestructura:" -ForegroundColor White
Write-Host "   cd infrastructure" -ForegroundColor Cyan

Write-Host ""
Write-Host "2. Compila el proyecto:" -ForegroundColor White
Write-Host "   npm run build" -ForegroundColor Cyan

Write-Host ""
Write-Host "3. Despliega los cambios:" -ForegroundColor White
Write-Host "   cdk deploy" -ForegroundColor Cyan

Write-Host ""
Write-Host "4. Confirma cuando CDK pregunte (Y/yes)" -ForegroundColor White

Write-Host ""
Write-Host "⏰ TIEMPO ESTIMADO:" -ForegroundColor Yellow
Write-Host "- Compilación: 1-2 minutos" -ForegroundColor White
Write-Host "- Despliegue: 5-10 minutos" -ForegroundColor White
Write-Host "- Propagación: 2-5 minutos" -ForegroundColor White

Write-Host ""
Write-Host "🧪 DESPUÉS DEL DESPLIEGUE:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Espera 5 minutos para propagación" -ForegroundColor White
Write-Host "2. Prueba crear sala en la app" -ForegroundColor White
Write-Host "3. El error GraphQL debería desaparecer" -ForegroundColor White

Write-Host ""
Write-Host "❗ IMPORTANTE:" -ForegroundColor Red
Write-Host "- Este despliegue actualizará el esquema GraphQL de AppSync" -ForegroundColor White
Write-Host "- No afectará a los datos existentes" -ForegroundColor White
Write-Host "- Las configuraciones de Cognito se mantendrán" -ForegroundColor White

Write-Host ""
Write-Host "🔍 SI EL PROBLEMA PERSISTE:" -ForegroundColor Yellow
Write-Host "Verifica en AWS AppSync Console:" -ForegroundColor White
Write-Host "- Schema actualizado correctamente" -ForegroundColor Gray
Write-Host "- Resolvers conectados a las mutaciones" -ForegroundColor Gray
Write-Host "- Data sources funcionando" -ForegroundColor Gray

Write-Host ""
Write-Host "🚀 COMANDOS RÁPIDOS:" -ForegroundColor Cyan
Write-Host "cd infrastructure && npm run build && cdk deploy" -ForegroundColor Green

Write-Host ""
Write-Host "📋 ORDEN DE PRIORIDADES:" -ForegroundColor Yellow
Write-Host "1. Redesplegar infraestructura (esquema GraphQL)" -ForegroundColor White
Write-Host "2. Continuar configurando Google Cloud Console" -ForegroundColor White
Write-Host "3. Continuar configurando AWS Cognito Console" -ForegroundColor White
Write-Host "4. Probar APK cuando termine la compilación" -ForegroundColor White