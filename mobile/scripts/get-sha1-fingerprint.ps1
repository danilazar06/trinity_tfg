# Script para obtener SHA-1 Fingerprint automáticamente
# Este fingerprint es necesario para configurar Google Sign-In en Android

Write-Host "🔑 OBTENIENDO SHA-1 FINGERPRINT PARA GOOGLE SIGN-IN" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "📋 Este fingerprint es necesario para configurar Google Cloud Console" -ForegroundColor Yellow
Write-Host "Se usará para el Android Client ID en Google Cloud Console" -ForegroundColor Yellow

Write-Host ""
Write-Host "🔍 Buscando keystore de debug..." -ForegroundColor Yellow

# Rutas comunes del keystore de debug
$keystorePaths = @(
    "$env:USERPROFILE\.android\debug.keystore",
    "$env:HOME/.android/debug.keystore",
    "C:\Users\$env:USERNAME\.android\debug.keystore"
)

$keystorePath = $null
foreach ($path in $keystorePaths) {
    if (Test-Path $path) {
        $keystorePath = $path
        break
    }
}

if (-not $keystorePath) {
    Write-Host "❌ No se encontró debug.keystore en las rutas comunes" -ForegroundColor Red
    Write-Host ""
    Write-Host "🔧 SOLUCIÓN:" -ForegroundColor Yellow
    Write-Host "1. Ejecuta una build de Android primero:" -ForegroundColor White
    Write-Host "   npx expo run:android" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "2. O crea el keystore manualmente:" -ForegroundColor White
    Write-Host "   keytool -genkey -v -keystore ~/.android/debug.keystore -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "3. Usa la contraseña: android" -ForegroundColor White
    exit 1
}

Write-Host "✅ Keystore encontrado en: $keystorePath" -ForegroundColor Green

Write-Host ""
Write-Host "🔑 Obteniendo SHA-1 fingerprint..." -ForegroundColor Yellow

try {
    # Ejecutar keytool para obtener el fingerprint
    $keytoolOutput = & keytool -list -v -keystore $keystorePath -alias androiddebugkey -storepass android -keypass android 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        # Buscar la línea del SHA-1
        $sha1Line = $keytoolOutput | Where-Object { $_ -match "SHA1:" }
        
        if ($sha1Line) {
            $sha1 = ($sha1Line -split "SHA1:")[1].Trim()
            
            Write-Host ""
            Write-Host "✅ SHA-1 FINGERPRINT OBTENIDO:" -ForegroundColor Green
            Write-Host "==============================" -ForegroundColor Green
            Write-Host $sha1 -ForegroundColor Yellow
            Write-Host ""
            
            # Copiar al clipboard si es posible
            try {
                $sha1 | Set-Clipboard
                Write-Host "📋 SHA-1 copiado al clipboard automáticamente" -ForegroundColor Green
            } catch {
                Write-Host "📋 Copia manualmente el SHA-1 de arriba" -ForegroundColor Yellow
            }
            
            Write-Host ""
            Write-Host "🔧 SIGUIENTE PASO:" -ForegroundColor Cyan
            Write-Host "1. Ve a Google Cloud Console: https://console.cloud.google.com/apis/credentials" -ForegroundColor White
            Write-Host "2. Busca tu Android Client ID: 230498169556-ipt2iafpd75h17kjcsgmb89oc9u1ciii.apps.googleusercontent.com" -ForegroundColor White
            Write-Host "3. Haz clic en EDITAR (ícono de lápiz)" -ForegroundColor White
            Write-Host "4. En 'SHA certificate fingerprints', AÑADE este SHA-1:" -ForegroundColor White
            Write-Host "   $sha1" -ForegroundColor Yellow
            Write-Host "5. Verifica que 'Package name' sea: com.trinity.app" -ForegroundColor White
            Write-Host "6. Haz clic en SAVE" -ForegroundColor White
            
            Write-Host ""
            Write-Host "⚠️ IMPORTANTE:" -ForegroundColor Red
            Write-Host "- Los cambios pueden tardar hasta 5 minutos en propagarse" -ForegroundColor White
            Write-Host "- Después de guardar, ejecuta: npx expo start --clear" -ForegroundColor White
            Write-Host "- Prueba Google Sign-In nuevamente" -ForegroundColor White
            
        } else {
            Write-Host "❌ No se pudo encontrar el SHA-1 en la salida de keytool" -ForegroundColor Red
            Write-Host ""
            Write-Host "📋 Salida completa de keytool:" -ForegroundColor Yellow
            $keytoolOutput | ForEach-Object { Write-Host $_ -ForegroundColor Gray }
        }
    } else {
        Write-Host "❌ Error ejecutando keytool:" -ForegroundColor Red
        $keytoolOutput | ForEach-Object { Write-Host $_ -ForegroundColor Red }
        
        Write-Host ""
        Write-Host "🔧 SOLUCIÓN MANUAL:" -ForegroundColor Yellow
        Write-Host "Ejecuta este comando manualmente:" -ForegroundColor White
        Write-Host "keytool -list -v -keystore `"$keystorePath`" -alias androiddebugkey -storepass android -keypass android" -ForegroundColor Cyan
    }
    
} catch {
    Write-Host "❌ Error ejecutando keytool: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "🔧 VERIFICACIONES:" -ForegroundColor Yellow
    Write-Host "1. ¿Está Java/JDK instalado?" -ForegroundColor White
    Write-Host "2. ¿Está keytool en el PATH?" -ForegroundColor White
    Write-Host "3. ¿Existe el archivo keystore?" -ForegroundColor White
    Write-Host ""
    Write-Host "📋 Comando manual:" -ForegroundColor Yellow
    Write-Host "keytool -list -v -keystore `"$keystorePath`" -alias androiddebugkey -storepass android -keypass android" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "📖 INFORMACIÓN ADICIONAL:" -ForegroundColor Cyan
Write-Host "- Este SHA-1 es para el keystore de DEBUG" -ForegroundColor Gray
Write-Host "- Para producción necesitarás el SHA-1 del keystore de release" -ForegroundColor Gray
Write-Host "- Cada keystore tiene un SHA-1 diferente" -ForegroundColor Gray
Write-Host "- El package name debe ser exactamente: com.trinity.app" -ForegroundColor Gray