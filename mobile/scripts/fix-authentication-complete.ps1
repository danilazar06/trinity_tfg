# TRINITY - CONFIGURACIÓN COMPLETA DE AUTENTICACIÓN
# Soluciona DEVELOPER_ERROR y USER_PASSWORD_AUTH flow not enabled

Write-Host "🔧 TRINITY - CONFIGURACIÓN COMPLETA DE AUTENTICACIÓN" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "📋 PROBLEMA 1: DEVELOPER_ERROR (Google Sign-In)" -ForegroundColor Red
Write-Host "📋 PROBLEMA 2: USER_PASSWORD_AUTH flow not enabled" -ForegroundColor Red
Write-Host ""

Write-Host "⏰ MIENTRAS EL APK SE COMPILA, CONFIGURA LAS CONSOLAS:" -ForegroundColor Yellow
Write-Host ""

# ============================================================================
# PARTE 1: GOOGLE CLOUD CONSOLE
# ============================================================================

Write-Host "🌐 PARTE 1: GOOGLE CLOUD CONSOLE" -ForegroundColor Green
Write-Host "=================================" -ForegroundColor Green

Write-Host ""
Write-Host "1️⃣ Abrir Google Cloud Console:" -ForegroundColor White
Write-Host "   https://console.cloud.google.com/apis/credentials" -ForegroundColor Cyan

Write-Host ""
Write-Host "2️⃣ Buscar y editar el WEB CLIENT ID:" -ForegroundColor White
Write-Host "   230498169556-cqb6dv3o58oeblrfrk49o0a6l7ecjtrn.apps.googleusercontent.com" -ForegroundColor Yellow

Write-Host ""
Write-Host "3️⃣ En 'Authorized redirect URIs':" -ForegroundColor White
Write-Host "   - BORRAR cualquier URL de Firebase" -ForegroundColor Red
Write-Host "   - AÑADIR esta URL:" -ForegroundColor Green
Write-Host "     https://trinity-auth-dev.auth.eu-west-1.amazoncognito.com/oauth2/idpresponse" -ForegroundColor Green

Write-Host ""
Write-Host "4️⃣ GUARDAR los cambios" -ForegroundColor White

Write-Host ""
Write-Host "❗ IMPORTANTE: NO toques el Android Client ID (230498169556-ipt2iafpd75h17kjcsgmb89oc9u1ciii)" -ForegroundColor Red

# ============================================================================
# PARTE 2: AWS COGNITO CONSOLE
# ============================================================================

Write-Host ""
Write-Host "☁️ PARTE 2: AWS COGNITO CONSOLE" -ForegroundColor Green
Write-Host "===============================" -ForegroundColor Green

Write-Host ""
Write-Host "1️⃣ Abrir AWS Cognito Console:" -ForegroundColor White
Write-Host "   https://eu-west-1.console.aws.amazon.com/cognito/v2/idp/user-pools" -ForegroundColor Cyan

Write-Host ""
Write-Host "2️⃣ Seleccionar User Pool: trinity-users-dev" -ForegroundColor White

Write-Host ""
Write-Host "3️⃣ Ir a 'App integration' > 'App clients and analytics'" -ForegroundColor White

Write-Host ""
Write-Host "4️⃣ Editar el App Client: trinity-mobile-dev" -ForegroundColor White

Write-Host ""
Write-Host "5️⃣ En 'Authentication flows', HABILITAR:" -ForegroundColor White
Write-Host "   ✅ ALLOW_USER_PASSWORD_AUTH" -ForegroundColor Green
Write-Host "   ✅ ALLOW_USER_SRP_AUTH" -ForegroundColor Green
Write-Host "   ✅ ALLOW_REFRESH_TOKEN_AUTH" -ForegroundColor Green
Write-Host "   ✅ ALLOW_ADMIN_USER_PASSWORD_AUTH" -ForegroundColor Green

Write-Host ""
Write-Host "6️⃣ GUARDAR los cambios" -ForegroundColor White

Write-Host ""
Write-Host "7️⃣ Ir a 'Sign-in experience' > 'Federated identity provider sign-in'" -ForegroundColor White

Write-Host ""
Write-Host "8️⃣ Editar Google Identity Provider:" -ForegroundColor White
Write-Host "   - Client ID: 230498169556-cqb6dv3o58oeblrfrk49o0a6l7ecjtrn.apps.googleusercontent.com" -ForegroundColor Yellow
Write-Host "   - Client secret: [Copiar desde Google Cloud Console]" -ForegroundColor Yellow

Write-Host ""
Write-Host "9️⃣ GUARDAR los cambios" -ForegroundColor White

# ============================================================================
# PARTE 3: VERIFICACIÓN
# ============================================================================

Write-Host ""
Write-Host "✅ PARTE 3: VERIFICACIÓN" -ForegroundColor Green
Write-Host "========================" -ForegroundColor Green

Write-Host ""
Write-Host "Después de configurar ambas consolas:" -ForegroundColor White

Write-Host ""
Write-Host "1️⃣ Google Cloud Console debe mostrar:" -ForegroundColor White
Write-Host "   - Web Client ID con redirect URI de Cognito" -ForegroundColor Gray
Write-Host "   - Android Client ID sin cambios" -ForegroundColor Gray

Write-Host ""
Write-Host "2️⃣ AWS Cognito debe mostrar:" -ForegroundColor White
Write-Host "   - Authentication flows habilitados" -ForegroundColor Gray
Write-Host "   - Google Identity Provider configurado" -ForegroundColor Gray

Write-Host ""
Write-Host "3️⃣ Cuando el APK esté listo, probar:" -ForegroundColor White
Write-Host "   - Google Sign-In (no debe mostrar DEVELOPER_ERROR)" -ForegroundColor Gray
Write-Host "   - Email/Password (no debe mostrar USER_PASSWORD_AUTH error)" -ForegroundColor Gray

# ============================================================================
# COMANDOS DE VERIFICACIÓN
# ============================================================================

Write-Host ""
Write-Host "🔍 COMANDOS DE VERIFICACIÓN (opcional):" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "Para verificar la configuración de Cognito:" -ForegroundColor White
Write-Host "aws cognito-idp describe-user-pool-client --user-pool-id eu-west-1_6UxioIj4z --client-id 59dpqsm580j14ulkcha19shl64 --region eu-west-1" -ForegroundColor Gray

Write-Host ""
Write-Host "Para verificar Google Identity Provider:" -ForegroundColor White
Write-Host "aws cognito-idp list-identity-providers --user-pool-id eu-west-1_6UxioIj4z --region eu-west-1" -ForegroundColor Gray

Write-Host ""
Write-Host "🎯 OBJETIVO FINAL:" -ForegroundColor Yellow
Write-Host "=================" -ForegroundColor Yellow
Write-Host "✅ Google Sign-In funciona sin DEVELOPER_ERROR" -ForegroundColor Green
Write-Host "✅ Email/Password funciona sin USER_PASSWORD_AUTH error" -ForegroundColor Green
Write-Host "✅ Usuarios se crean automáticamente en AWS Cognito" -ForegroundColor Green
Write-Host "✅ Room creation funciona (después de desplegar GraphQL schema)" -ForegroundColor Green

Write-Host ""
Write-Host "⏭️ SIGUIENTE PASO:" -ForegroundColor Cyan
Write-Host "Una vez configuradas las consolas, probar la app cuando el APK esté listo." -ForegroundColor White