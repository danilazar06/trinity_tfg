# Script para encontrar el Cognito Domain URL

Write-Host "🔍 ENCONTRAR COGNITO DOMAIN URL" -ForegroundColor Cyan
Write-Host "===============================" -ForegroundColor Cyan

Write-Host ""
Write-Host "📋 PASOS EN AWS COGNITO CONSOLE:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Ve a: https://console.aws.amazon.com/cognito/" -ForegroundColor White
Write-Host ""
Write-Host "2. Selecciona User Pool: trinity-users-dev" -ForegroundColor White
Write-Host ""
Write-Host "3. Ve a 'App integration' > 'Domain'" -ForegroundColor White
Write-Host ""
Write-Host "4. Busca 'Cognito domain' - debería ser algo como:" -ForegroundColor White
Write-Host "   trinity-auth-dev-xxxxxx.auth.eu-west-1.amazoncognito.com" -ForegroundColor Gray
Write-Host ""
Write-Host "5. COPIA el dominio completo" -ForegroundColor White

Write-Host ""
Write-Host "🔧 FORMAR LA URL DE CALLBACK:" -ForegroundColor Yellow
Write-Host ""
Write-Host "Una vez que tengas el dominio, la URL de callback será:" -ForegroundColor White
Write-Host "https://[TU_DOMINIO_COGNITO]/oauth2/idpresponse" -ForegroundColor Cyan
Write-Host ""
Write-Host "Ejemplo:" -ForegroundColor Gray
Write-Host "https://trinity-auth-dev-abc123.auth.eu-west-1.amazoncognito.com/oauth2/idpresponse" -ForegroundColor Gray

Write-Host ""
Write-Host "📋 INFORMACIÓN ACTUAL (desde app.json):" -ForegroundColor Yellow
Write-Host "- Cognito Domain: trinity-auth-dev.auth.eu-west-1.amazoncognito.com" -ForegroundColor White
Write-Host "- Callback URL esperada: https://trinity-auth-dev.auth.eu-west-1.amazoncognito.com/oauth2/idpresponse" -ForegroundColor Green

Write-Host ""
Write-Host "🌐 CONFIGURAR EN GOOGLE CLOUD CONSOLE:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Ve a: https://console.cloud.google.com/apis/credentials" -ForegroundColor White
Write-Host "2. Busca tu Web Client ID:" -ForegroundColor White
Write-Host "   230498169556-cqb6dv3o58oeblrfrk49o0a6l7ecjtrn.apps.googleusercontent.com" -ForegroundColor Gray
Write-Host "3. Haz clic 'Edit'" -ForegroundColor White
Write-Host "4. En 'Authorized redirect URIs':" -ForegroundColor White
Write-Host "   - BORRA las URLs de Firebase" -ForegroundColor Gray
Write-Host "   - AÑADE: https://trinity-auth-dev.auth.eu-west-1.amazoncognito.com/oauth2/idpresponse" -ForegroundColor Green
Write-Host "5. Guarda cambios" -ForegroundColor White

Write-Host ""
Write-Host "❗ IMPORTANTE:" -ForegroundColor Red
Write-Host "- Usa el dominio EXACTO que aparece en tu AWS Console" -ForegroundColor White
Write-Host "- La URL debe terminar en /oauth2/idpresponse" -ForegroundColor White
Write-Host "- NO uses http://, siempre https://" -ForegroundColor White