# Guía para configurar Google Identity Provider en AWS Cognito

Write-Host "🔧 AWS Cognito - Configurar Google Identity Provider" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "📋 PASO 1: Obtener credenciales de Google (solo trámite)" -ForegroundColor Yellow
Write-Host ""
Write-Host "🌐 Ve a Google Cloud Console:" -ForegroundColor White
Write-Host "   https://console.cloud.google.com/" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Crea proyecto (o usa existente): trinity-app-production" -ForegroundColor Gray
Write-Host "2. Ve a 'APIs & Services' > 'Credentials'" -ForegroundColor Gray
Write-Host "3. Crea 'OAuth 2.0 Client ID':" -ForegroundColor Gray
Write-Host "   - Application type: Android" -ForegroundColor Gray
Write-Host "   - Package name: com.trinity.app" -ForegroundColor Gray
Write-Host "   - SHA-1 certificate fingerprint: [TU_SHA1]" -ForegroundColor Gray
Write-Host "4. COPIA el Client ID generado" -ForegroundColor Gray

Write-Host ""
Write-Host "📋 PASO 2: Configurar AWS Cognito User Pool" -ForegroundColor Yellow
Write-Host ""
Write-Host "🌐 Ve a AWS Console:" -ForegroundColor White
Write-Host "   https://console.aws.amazon.com/cognito/" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Selecciona tu User Pool: trinity-users-dev" -ForegroundColor Gray
Write-Host "2. Ve a 'Sign-in experience' > 'Federated identity provider sign-in'" -ForegroundColor Gray
Write-Host "3. Haz clic 'Add identity provider'" -ForegroundColor Gray
Write-Host "4. Selecciona 'Google'" -ForegroundColor Gray
Write-Host "5. Configura:" -ForegroundColor Gray
Write-Host "   - Google app ID: [TU_GOOGLE_CLIENT_ID]" -ForegroundColor Gray
Write-Host "   - Google app secret: [TU_GOOGLE_CLIENT_SECRET]" -ForegroundColor Gray
Write-Host "   - Authorized scopes: email openid profile" -ForegroundColor Gray
Write-Host "6. Haz clic 'Add identity provider'" -ForegroundColor Gray

Write-Host ""
Write-Host "📋 PASO 3: Configurar App Client" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Ve a 'App integration' > 'App clients'" -ForegroundColor Gray
Write-Host "2. Selecciona tu app client: trinity-mobile-dev" -ForegroundColor Gray
Write-Host "3. Haz clic 'Edit'" -ForegroundColor Gray
Write-Host "4. En 'Identity providers':" -ForegroundColor Gray
Write-Host "   - ✅ Cognito user pool" -ForegroundColor Gray
Write-Host "   - ✅ Google" -ForegroundColor Gray
Write-Host "5. Guarda cambios" -ForegroundColor Gray

Write-Host ""
Write-Host "📋 PASO 4: Configurar Attribute Mapping" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Ve a 'Sign-in experience' > 'Federated identity provider sign-in'" -ForegroundColor Gray
Write-Host "2. Haz clic en 'Google' (el que acabas de crear)" -ForegroundColor Gray
Write-Host "3. Ve a 'Attribute mapping'" -ForegroundColor Gray
Write-Host "4. Configura mapeo:" -ForegroundColor Gray
Write-Host "   - email -> email" -ForegroundColor Gray
Write-Host "   - name -> name" -ForegroundColor Gray
Write-Host "   - picture -> picture" -ForegroundColor Gray
Write-Host "5. Guarda cambios" -ForegroundColor Gray

Write-Host ""
Write-Host "🔍 INFORMACIÓN ACTUAL:" -ForegroundColor Cyan
Write-Host "- User Pool ID: eu-west-1_6UxioIj4z" -ForegroundColor White
Write-Host "- Client ID: 59dpqsm580j14ulkcha19shl64" -ForegroundColor White
Write-Host "- Region: eu-west-1" -ForegroundColor White
Write-Host "- Domain: trinity-auth-dev.auth.eu-west-1.amazoncognito.com" -ForegroundColor White

Write-Host ""
Write-Host "✅ RESULTADO:" -ForegroundColor Green
Write-Host "- Google será un Identity Provider en tu Cognito User Pool" -ForegroundColor White
Write-Host "- Los usuarios se crearán automáticamente en Cognito" -ForegroundColor White
Write-Host "- No necesitas Firebase ni infraestructura de Google" -ForegroundColor White