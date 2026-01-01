# Configurar Google Cloud Console AHORA (mientras compila)

Write-Host "🌐 CONFIGURAR GOOGLE CLOUD CONSOLE - AHORA" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "⏰ MIENTRAS EL APK SE COMPILA..." -ForegroundColor Yellow
Write-Host ""

Write-Host "📋 PASO 1: Abrir Google Cloud Console" -ForegroundColor Green
Write-Host "URL: https://console.cloud.google.com/apis/credentials" -ForegroundColor Cyan
Write-Host ""

Write-Host "📋 PASO 2: Buscar tu Web Client ID" -ForegroundColor Green
Write-Host "Busca en la lista:" -ForegroundColor White
Write-Host "230498169556-cqb6dv3o58oeblrfrk49o0a6l7ecjtrn.apps.googleusercontent.com" -ForegroundColor Yellow
Write-Host ""

Write-Host "📋 PASO 3: Editar el Web Client ID" -ForegroundColor Green
Write-Host "1. Haz clic en el ícono de EDITAR (lápiz) al lado del Client ID" -ForegroundColor White
Write-Host "2. Busca la sección 'Authorized redirect URIs'" -ForegroundColor White
Write-Host "3. BORRA cualquier URL de Firebase que esté ahí" -ForegroundColor White
Write-Host "4. AÑADE esta URL:" -ForegroundColor White
Write-Host "   https://trinity-auth-dev.auth.eu-west-1.amazoncognito.com/oauth2/idpresponse" -ForegroundColor Green
Write-Host "5. Haz clic 'SAVE' o 'GUARDAR'" -ForegroundColor White

Write-Host ""
Write-Host "✅ VERIFICACIÓN:" -ForegroundColor Yellow
Write-Host "Después de guardar, verifica que:" -ForegroundColor White
Write-Host "- Application type: Web application" -ForegroundColor Gray
Write-Host "- Name: [Cualquier nombre]" -ForegroundColor Gray
Write-Host "- Authorized redirect URIs contiene SOLO:" -ForegroundColor Gray
Write-Host "  https://trinity-auth-dev.auth.eu-west-1.amazoncognito.com/oauth2/idpresponse" -ForegroundColor Green

Write-Host ""
Write-Host "❗ IMPORTANTE:" -ForegroundColor Red
Write-Host "- NO toques el Android Client ID (230498169556-ipt2iafpd75h17kjcsgmb89oc9u1ciii)" -ForegroundColor White
Write-Host "- Solo edita el Web Client ID (230498169556-cqb6dv3o58oeblrfrk49o0a6l7ecjtrn)" -ForegroundColor White
Write-Host "- La URL debe ser EXACTAMENTE como se muestra arriba" -ForegroundColor White

Write-Host ""
Write-Host "⏭️ SIGUIENTE:" -ForegroundColor Cyan
Write-Host "Una vez guardado en Google Cloud Console, continúa con AWS Cognito..." -ForegroundColor White