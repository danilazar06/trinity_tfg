# Configurar AWS Cognito Console AHORA (mientras compila)

Write-Host "☁️ CONFIGURAR AWS COGNITO CONSOLE - AHORA" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "📋 PASO 1: Abrir AWS Cognito Console" -ForegroundColor Green
Write-Host "URL: https://console.aws.amazon.com/cognito/" -ForegroundColor Cyan
Write-Host ""

Write-Host "📋 PASO 2: Seleccionar User Pool" -ForegroundColor Green
Write-Host "1. Busca y selecciona: trinity-users-dev" -ForegroundColor White
Write-Host "2. Haz clic en el nombre para entrar" -ForegroundColor White
Write-Host ""

Write-Host "📋 PASO 3: Configurar Google Identity Provider" -ForegroundColor Green
Write-Host "1. Ve a 'Sign-in experience' > 'Federated identity provider sign-in'" -ForegroundColor White
Write-Host "2. Busca 'Google' en la lista de providers" -ForegroundColor White
Write-Host "3. Haz clic en 'Google' para editarlo" -ForegroundColor White
Write-Host "4. Actualiza los campos:" -ForegroundColor White
Write-Host ""
Write-Host "   Google app ID:" -ForegroundColor Yellow
Write-Host "   230498169556-cqb6dv3o58oeblrfrk49o0a6l7ecjtrn.apps.googleusercontent.com" -ForegroundColor Green
Write-Host ""
Write-Host "   Google app secret:" -ForegroundColor Yellow
Write-Host "   [Pega el Client Secret que copiaste de Google Cloud Console]" -ForegroundColor Green
Write-Host ""
Write-Host "   Authorized scopes:" -ForegroundColor Yellow
Write-Host "   email openid profile" -ForegroundColor Green
Write-Host ""
Write-Host "5. Haz clic 'Save changes'" -ForegroundColor White

Write-Host ""
Write-Host "📋 PASO 4: Verificar App Client Configuration" -ForegroundColor Green
Write-Host "1. Ve a 'App integration' > 'App clients'" -ForegroundColor White
Write-Host "2. Busca y haz clic en: trinity-mobile-dev" -ForegroundColor White
Write-Host "3. Verifica 'Authentication flows' - deben estar habilitados:" -ForegroundColor White
Write-Host "   ✅ ALLOW_USER_PASSWORD_AUTH" -ForegroundColor Yellow
Write-Host "   ✅ ALLOW_USER_SRP_AUTH" -ForegroundColor Yellow
Write-Host "   ✅ ALLOW_REFRESH_TOKEN_AUTH" -ForegroundColor Yellow
Write-Host "4. Si no están habilitados, márcalos y guarda" -ForegroundColor White

Write-Host ""
Write-Host "📋 PASO 5: Verificar Identity Providers en App Client" -ForegroundColor Green
Write-Host "1. En el mismo App Client (trinity-mobile-dev)" -ForegroundColor White
Write-Host "2. Ve a 'Hosted UI settings'" -ForegroundColor White
Write-Host "3. En 'Identity providers' verifica que estén marcados:" -ForegroundColor White
Write-Host "   ✅ Cognito user pool" -ForegroundColor Yellow
Write-Host "   ✅ Google" -ForegroundColor Yellow
Write-Host "4. Si no están marcados, márcalos y guarda" -ForegroundColor White

Write-Host ""
Write-Host "✅ VERIFICACIÓN FINAL:" -ForegroundColor Yellow
Write-Host "Después de todos los cambios, verifica:" -ForegroundColor White
Write-Host "- Google Identity Provider configurado con nuevo Client ID ✅" -ForegroundColor Gray
Write-Host "- Authentication flows habilitados ✅" -ForegroundColor Gray
Write-Host "- Identity providers marcados en App Client ✅" -ForegroundColor Gray

Write-Host ""
Write-Host "⏰ TIEMPO DE PROPAGACIÓN:" -ForegroundColor Red
Write-Host "AWS necesita 5-10 minutos para propagar los cambios" -ForegroundColor White
Write-Host "No te preocupes si no funciona inmediatamente" -ForegroundColor White

Write-Host ""
Write-Host "🎯 OBJETIVO:" -ForegroundColor Cyan
Write-Host "Resolver ambos errores:" -ForegroundColor White
Write-Host "- DEVELOPER_ERROR (Google Sign-In)" -ForegroundColor White
Write-Host "- USER_PASSWORD_AUTH flow not enabled (Email/Password)" -ForegroundColor White