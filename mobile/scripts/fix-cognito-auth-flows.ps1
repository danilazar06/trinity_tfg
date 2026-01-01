# TRINITY - FIX COGNITO AUTHENTICATION FLOWS
# Soluciona "USER_PASSWORD_AUTH flow not enabled for this client"

Write-Host "🔧 FIXING COGNITO AUTHENTICATION FLOWS" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "📋 PROBLEMA: USER_PASSWORD_AUTH flow not enabled for this client" -ForegroundColor Red
Write-Host "📋 SOLUCIÓN: Habilitar authentication flows via AWS CLI" -ForegroundColor Green
Write-Host ""

# Configuración actual
$UserPoolId = "eu-west-1_6UxioIj4z"
$ClientId = "59dpqsm580j14ulkcha19shl64"
$Region = "eu-west-1"

Write-Host "🔍 Verificando configuración actual..." -ForegroundColor Yellow

# Verificar configuración actual
Write-Host ""
Write-Host "User Pool ID: $UserPoolId" -ForegroundColor White
Write-Host "Client ID: $ClientId" -ForegroundColor White
Write-Host "Region: $Region" -ForegroundColor White

Write-Host ""
Write-Host "📋 Ejecutando comando para habilitar authentication flows..." -ForegroundColor Yellow

# Comando para actualizar el User Pool Client
$UpdateCommand = @"
aws cognito-idp update-user-pool-client \
  --user-pool-id $UserPoolId \
  --client-id $ClientId \
  --region $Region \
  --explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_USER_SRP_AUTH ALLOW_REFRESH_TOKEN_AUTH ALLOW_ADMIN_USER_PASSWORD_AUTH \
  --supported-identity-providers COGNITO Google \
  --callback-urls "trinity://auth/callback" "https://trinity.app/auth/callback" \
  --logout-urls "trinity://auth/logout" "https://trinity.app/auth/logout" \
  --allowed-o-auth-flows authorization_code implicit \
  --allowed-o-auth-scopes email openid profile \
  --allowed-o-auth-flows-user-pool-client
"@

Write-Host ""
Write-Host "🚀 EJECUTANDO COMANDO:" -ForegroundColor Green
Write-Host $UpdateCommand -ForegroundColor Gray

Write-Host ""
Write-Host "⏳ Ejecutando..." -ForegroundColor Yellow

try {
    # Ejecutar el comando
    $result = Invoke-Expression "aws cognito-idp update-user-pool-client --user-pool-id $UserPoolId --client-id $ClientId --region $Region --explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_USER_SRP_AUTH ALLOW_REFRESH_TOKEN_AUTH ALLOW_ADMIN_USER_PASSWORD_AUTH --supported-identity-providers COGNITO Google --callback-urls `"trinity://auth/callback`" `"https://trinity.app/auth/callback`" --logout-urls `"trinity://auth/logout`" `"https://trinity.app/auth/logout`" --allowed-o-auth-flows authorization_code implicit --allowed-o-auth-scopes email openid profile --allowed-o-auth-flows-user-pool-client"
    
    Write-Host ""
    Write-Host "✅ ÉXITO: Authentication flows habilitados correctamente" -ForegroundColor Green
    
    Write-Host ""
    Write-Host "🔍 Verificando cambios..." -ForegroundColor Yellow
    
    # Verificar los cambios
    $verifyResult = Invoke-Expression "aws cognito-idp describe-user-pool-client --user-pool-id $UserPoolId --client-id $ClientId --region $Region"
    
    Write-Host ""
    Write-Host "✅ CONFIGURACIÓN ACTUALIZADA" -ForegroundColor Green
    Write-Host "Los siguientes authentication flows están ahora habilitados:" -ForegroundColor White
    Write-Host "- ALLOW_USER_PASSWORD_AUTH ✅" -ForegroundColor Green
    Write-Host "- ALLOW_USER_SRP_AUTH ✅" -ForegroundColor Green
    Write-Host "- ALLOW_REFRESH_TOKEN_AUTH ✅" -ForegroundColor Green
    Write-Host "- ALLOW_ADMIN_USER_PASSWORD_AUTH ✅" -ForegroundColor Green
    
} catch {
    Write-Host ""
    Write-Host "❌ ERROR: No se pudo actualizar la configuración" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    
    Write-Host ""
    Write-Host "🔧 SOLUCIÓN MANUAL:" -ForegroundColor Yellow
    Write-Host "1. Ir a AWS Cognito Console" -ForegroundColor White
    Write-Host "2. Seleccionar User Pool: trinity-users-dev" -ForegroundColor White
    Write-Host "3. Ir a 'App integration' > 'App clients and analytics'" -ForegroundColor White
    Write-Host "4. Editar el App Client: trinity-mobile-dev" -ForegroundColor White
    Write-Host "5. Habilitar todos los Authentication flows" -ForegroundColor White
}

Write-Host ""
Write-Host "🎯 RESULTADO ESPERADO:" -ForegroundColor Cyan
Write-Host "=====================" -ForegroundColor Cyan
Write-Host "✅ Email/Password login debe funcionar sin errores" -ForegroundColor Green
Write-Host "✅ Google Sign-In debe funcionar (después de configurar Google Console)" -ForegroundColor Green

Write-Host ""
Write-Host "⏭️ SIGUIENTE PASO:" -ForegroundColor Yellow
Write-Host "Configurar Google Cloud Console con el script anterior" -ForegroundColor White