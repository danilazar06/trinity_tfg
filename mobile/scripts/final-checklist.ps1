# Checklist final antes de compilar

Write-Host "✅ CHECKLIST FINAL - Antes de Compilar" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "📋 CONFIGURACIÓN VERIFICADA:" -ForegroundColor Green
Write-Host ""
Write-Host "✅ mobile/app.json:" -ForegroundColor Yellow
Write-Host "   - googleWebClientId: 230498169556-cqb6dv3o58oeblrfrk49o0a6l7ecjtrn.apps.googleusercontent.com" -ForegroundColor White
Write-Host "   - googleAndroidClientId: 230498169556-ipt2iafpd75h17kjcsgmb89oc9u1ciii.apps.googleusercontent.com" -ForegroundColor White
Write-Host "   - iosUrlScheme: com.googleusercontent.apps.230498169556-cqb6dv3o58oeblrfrk49o0a6l7ecjtrn" -ForegroundColor White

Write-Host ""
Write-Host "✅ mobile/google-services.json:" -ForegroundColor Yellow
Write-Host "   - Android Client ID: 230498169556-ipt2iafpd75h17kjcsgmb89oc9u1ciii.apps.googleusercontent.com" -ForegroundColor White
Write-Host "   - Certificate Hash: 0c5d53d3a96c81a79021adc55e9b46a6af05b89f" -ForegroundColor White

Write-Host ""
Write-Host "✅ mobile/src/config/aws-config.ts:" -ForegroundColor Yellow
Write-Host "   - googleClientId: 230498169556-cqb6dv3o58oeblrfrk49o0a6l7ecjtrn.apps.googleusercontent.com" -ForegroundColor White

Write-Host ""
Write-Host "📋 PENDIENTE - CONFIGURAR EN CONSOLAS:" -ForegroundColor Red
Write-Host ""
Write-Host "🌐 Google Cloud Console:" -ForegroundColor Yellow
Write-Host "   URL: https://console.cloud.google.com/apis/credentials" -ForegroundColor Cyan
Write-Host "   1. Busca Web Client ID: 230498169556-cqb6dv3o58oeblrfrk49o0a6l7ecjtrn.apps.googleusercontent.com" -ForegroundColor White
Write-Host "   2. Haz clic 'Edit'" -ForegroundColor White
Write-Host "   3. En 'Authorized redirect URIs' añade:" -ForegroundColor White
Write-Host "      https://trinity-auth-dev.auth.eu-west-1.amazoncognito.com/oauth2/idpresponse" -ForegroundColor Green
Write-Host "   4. Guarda cambios" -ForegroundColor White

Write-Host ""
Write-Host "☁️ AWS Cognito Console:" -ForegroundColor Yellow
Write-Host "   URL: https://console.aws.amazon.com/cognito/" -ForegroundColor Cyan
Write-Host "   1. User Pool: trinity-users-dev" -ForegroundColor White
Write-Host "   2. Sign-in experience > Federated identity provider sign-in" -ForegroundColor White
Write-Host "   3. Edita Google Identity Provider:" -ForegroundColor White
Write-Host "      - Google app ID: 230498169556-cqb6dv3o58oeblrfrk49o0a6l7ecjtrn.apps.googleusercontent.com" -ForegroundColor Green
Write-Host "      - Google app secret: [El que copiaste]" -ForegroundColor Green
Write-Host "   4. Guarda cambios" -ForegroundColor White

Write-Host ""
Write-Host "🚀 DESPUÉS DE CONFIGURAR LAS CONSOLAS:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Compilar APK:" -ForegroundColor White
Write-Host "   eas build --platform android --profile production" -ForegroundColor Green
Write-Host ""
Write-Host "2. Instalar APK en dispositivo" -ForegroundColor White
Write-Host ""
Write-Host "3. Probar ambos métodos de autenticación:" -ForegroundColor White
Write-Host "   - Google Sign-In (sin DEVELOPER_ERROR)" -ForegroundColor Gray
Write-Host "   - Email/Password (sin USER_PASSWORD_AUTH error)" -ForegroundColor Gray

Write-Host ""
Write-Host "⏰ TIEMPO ESTIMADO:" -ForegroundColor Yellow
Write-Host "- Configuración consolas: 5-10 minutos" -ForegroundColor White
Write-Host "- Compilación APK: 10-15 minutos" -ForegroundColor White
Write-Host "- Propagación cambios: 5-10 minutos" -ForegroundColor White

Write-Host ""
Write-Host "❗ IMPORTANTE:" -ForegroundColor Red
Write-Host "- El SHA-1 se mantendrá igual: 0C:5D:53:D3:A9:6C:81:A7:90:21:AD:C5:5E:9B:46:A6:AF:05:B8:9F" -ForegroundColor White
Write-Host "- No necesitas cambiar el Android Client ID en Google Cloud Console" -ForegroundColor White
Write-Host "- Solo configura el Web Client ID para AWS Cognito" -ForegroundColor White