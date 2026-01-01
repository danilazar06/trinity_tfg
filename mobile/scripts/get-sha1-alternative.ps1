# Método alternativo para obtener SHA-1 sin keytool
# Usa herramientas de Windows para obtener el fingerprint

Write-Host "🔑 MÉTODO ALTERNATIVO PARA OBTENER SHA-1" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "📋 Java JDK no está disponible, usando método alternativo..." -ForegroundColor Yellow

$keystorePath = "$env:USERPROFILE\.android\debug.keystore"

if (-not (Test-Path $keystorePath)) {
    Write-Host "❌ Debug keystore no encontrado en: $keystorePath" -ForegroundColor Red
    Write-Host ""
    Write-Host "🔧 SOLUCIÓN:" -ForegroundColor Yellow
    Write-Host "1. Ejecuta una build de Android primero:" -ForegroundColor White
    Write-Host "   npx expo run:android" -ForegroundColor Cyan
    Write-Host "2. Esto creará automáticamente el debug keystore" -ForegroundColor White
    exit 1
}

Write-Host "✅ Keystore encontrado: $keystorePath" -ForegroundColor Green

Write-Host ""
Write-Host "🔧 OPCIONES PARA OBTENER SHA-1:" -ForegroundColor Yellow

Write-Host ""
Write-Host "OPCIÓN 1: Instalar Java JDK (RECOMENDADO)" -ForegroundColor Green
Write-Host "1. Descarga Java JDK desde: https://adoptium.net/" -ForegroundColor White
Write-Host "2. Instala y reinicia PowerShell" -ForegroundColor White
Write-Host "3. Ejecuta: ./get-sha1-fingerprint.ps1" -ForegroundColor Cyan

Write-Host ""
Write-Host "OPCIÓN 2: Usar Android Studio" -ForegroundColor Green
Write-Host "1. Abre Android Studio" -ForegroundColor White
Write-Host "2. Ve a File > Settings > Build > Signing" -ForegroundColor White
Write-Host "3. O usa el terminal integrado de Android Studio" -ForegroundColor White

Write-Host ""
Write-Host "OPCIÓN 3: Usar Expo Development Build" -ForegroundColor Green
Write-Host "1. Ejecuta: npx expo run:android" -ForegroundColor Cyan
Write-Host "2. Durante la build, Expo mostrará el SHA-1 en los logs" -ForegroundColor White
Write-Host "3. Busca líneas como 'SHA1 Fingerprint:' en la salida" -ForegroundColor White

Write-Host ""
Write-Host "OPCIÓN 4: Comando manual con ruta completa" -ForegroundColor Green
Write-Host "Si tienes Java instalado pero no en PATH:" -ForegroundColor White

# Buscar Java en ubicaciones comunes
$javaPaths = @(
    "${env:ProgramFiles}\Java\*\bin\keytool.exe",
    "${env:ProgramFiles(x86)}\Java\*\bin\keytool.exe",
    "${env:ProgramFiles}\Eclipse Adoptium\*\bin\keytool.exe",
    "${env:ProgramFiles}\Microsoft\*\bin\keytool.exe"
)

$keytoolFound = $false
foreach ($pattern in $javaPaths) {
    $matches = Get-ChildItem $pattern -ErrorAction SilentlyContinue
    if ($matches) {
        foreach ($match in $matches) {
            Write-Host "Encontrado: $($match.FullName)" -ForegroundColor Cyan
            Write-Host "Comando: `"$($match.FullName)`" -list -v -keystore `"$keystorePath`" -alias androiddebugkey -storepass android -keypass android" -ForegroundColor Yellow
            $keytoolFound = $true
        }
    }
}

if (-not $keytoolFound) {
    Write-Host "No se encontró keytool en ubicaciones comunes" -ForegroundColor Gray
}

Write-Host ""
Write-Host "OPCIÓN 5: Usar WSL (Windows Subsystem for Linux)" -ForegroundColor Green
Write-Host "Si tienes WSL instalado:" -ForegroundColor White
Write-Host "1. wsl" -ForegroundColor Cyan
Write-Host "2. sudo apt install openjdk-11-jdk" -ForegroundColor Cyan
Write-Host "3. keytool -list -v -keystore /mnt/c/Users/$env:USERNAME/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android" -ForegroundColor Cyan

Write-Host ""
Write-Host "🎯 RESULTADO ESPERADO:" -ForegroundColor Cyan
Write-Host "Deberías obtener algo como:" -ForegroundColor White
Write-Host "SHA1: A1:B2:C3:D4:E5:F6:G7:H8:I9:J0:K1:L2:M3:N4:O5:P6:Q7:R8:S9:T0" -ForegroundColor Yellow

Write-Host ""
Write-Host "📋 UNA VEZ QUE TENGAS EL SHA-1:" -ForegroundColor Green
Write-Host "1. Ve a: https://console.cloud.google.com/apis/credentials" -ForegroundColor White
Write-Host "2. Busca: 230498169556-ipt2iafpd75h17kjcsgmb89oc9u1ciii.apps.googleusercontent.com" -ForegroundColor White
Write-Host "3. Edita y añade el SHA-1 fingerprint" -ForegroundColor White
Write-Host "4. Guarda los cambios" -ForegroundColor White
Write-Host "5. Espera 5 minutos para que se propague" -ForegroundColor White
Write-Host "6. Prueba Google Sign-In nuevamente" -ForegroundColor White

Write-Host ""
Write-Host "⚠️ IMPORTANTE:" -ForegroundColor Red
Write-Host "- El SHA-1 debe ser del keystore de DEBUG para desarrollo" -ForegroundColor White
Write-Host "- Para producción necesitarás el SHA-1 del keystore de release" -ForegroundColor White
Write-Host "- Package name debe ser exactamente: com.trinity.app" -ForegroundColor White

Write-Host ""
Write-Host "🔍 DEBUGGING:" -ForegroundColor Cyan
Write-Host "Si después de configurar el SHA-1 aún tienes problemas:" -ForegroundColor White
Write-Host "1. Verifica que el proyecto de Google Cloud Console sea el correcto" -ForegroundColor Gray
Write-Host "2. Asegúrate de que el Android Client ID sea el correcto" -ForegroundColor Gray
Write-Host "3. Verifica que el package name coincida exactamente" -ForegroundColor Gray
Write-Host "4. Espera hasta 10 minutos para que los cambios se propaguen" -ForegroundColor Gray