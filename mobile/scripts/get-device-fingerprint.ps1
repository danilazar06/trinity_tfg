# Script PowerShell para obtener SHA-1 fingerprint desde dispositivo Android
# Requiere ADB (Android Debug Bridge) instalado

Write-Host "🔍 Obteniendo SHA-1 fingerprint desde dispositivo Android..." -ForegroundColor Cyan
Write-Host "=" * 60

# Verificar si ADB está disponible
try {
    $adbVersion = adb version 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "ADB no encontrado"
    }
    Write-Host "✅ ADB encontrado" -ForegroundColor Green
} catch {
    Write-Host "❌ ADB no está instalado o no está en PATH" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Para instalar ADB:" -ForegroundColor Yellow
    Write-Host "1. Descarga Android SDK Platform Tools"
    Write-Host "2. O instala Android Studio"
    Write-Host "3. Añade ADB al PATH del sistema"
    Write-Host ""
    Write-Host "🔗 Descarga directa: https://developer.android.com/studio/releases/platform-tools"
    exit 1
}

# Verificar dispositivos conectados
Write-Host ""
Write-Host "📱 Verificando dispositivos conectados..." -ForegroundColor Yellow

$devices = adb devices 2>$null
Write-Host $devices

if ($devices -match "device$") {
    Write-Host "✅ Dispositivo Android conectado" -ForegroundColor Green
} else {
    Write-Host "❌ No hay dispositivos conectados" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Para conectar tu dispositivo:" -ForegroundColor Yellow
    Write-Host "1. Conecta tu dispositivo por USB"
    Write-Host "2. Habilita 'Opciones de desarrollador' en Configuración"
    Write-Host "3. Activa 'Depuración USB'"
    Write-Host "4. Autoriza la conexión en tu dispositivo"
    exit 1
}

# Verificar si Trinity está instalada
Write-Host ""
Write-Host "🔍 Verificando si Trinity está instalada..." -ForegroundColor Yellow

$trinityPackage = adb shell pm list packages | Select-String "com.trinity.app"
if ($trinityPackage) {
    Write-Host "✅ Trinity encontrada: $trinityPackage" -ForegroundColor Green
} else {
    Write-Host "❌ Trinity no está instalada en el dispositivo" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Instala el APK primero:" -ForegroundColor Yellow
    Write-Host "adb install path/to/trinity.apk"
    exit 1
}

# Obtener información del certificado
Write-Host ""
Write-Host "🔐 Obteniendo información del certificado..." -ForegroundColor Yellow

try {
    $packageInfo = adb shell dumpsys package com.trinity.app | Select-String -Pattern "signatures|Signatures" -Context 0,10
    
    if ($packageInfo) {
        Write-Host "✅ Información del certificado encontrada:" -ForegroundColor Green
        Write-Host $packageInfo -ForegroundColor White
        
        # Intentar extraer el hash del certificado
        $certHash = adb shell dumpsys package com.trinity.app | Select-String -Pattern "cert\.|Certificate" -Context 0,5
        if ($certHash) {
            Write-Host ""
            Write-Host "🔑 Hash del certificado:" -ForegroundColor Cyan
            Write-Host $certHash -ForegroundColor White
        }
    } else {
        Write-Host "❌ No se pudo obtener información del certificado" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Error obteniendo información del certificado: $_" -ForegroundColor Red
}

# Obtener APK path y extraer certificado
Write-Host ""
Write-Host "📦 Intentando extraer certificado del APK..." -ForegroundColor Yellow

try {
    $apkPath = adb shell pm path com.trinity.app | ForEach-Object { $_.Replace("package:", "") }
    if ($apkPath) {
        Write-Host "✅ APK encontrado en: $apkPath" -ForegroundColor Green
        
        # Copiar APK al dispositivo local (temporal)
        $tempApk = "trinity-temp.apk"
        adb pull $apkPath.Trim() $tempApk 2>$null
        
        if (Test-Path $tempApk) {
            Write-Host "✅ APK copiado temporalmente" -ForegroundColor Green
            
            # Intentar extraer certificado con keytool (si está disponible)
            try {
                $certInfo = keytool -printcert -jarfile $tempApk 2>$null
                if ($certInfo) {
                    Write-Host ""
                    Write-Host "🎯 Información del certificado:" -ForegroundColor Cyan
                    Write-Host $certInfo -ForegroundColor White
                    
                    # Buscar SHA-1
                    $sha1Line = $certInfo | Select-String "SHA1"
                    if ($sha1Line) {
                        Write-Host ""
                        Write-Host "🔑 SHA-1 Fingerprint encontrado:" -ForegroundColor Green
                        Write-Host $sha1Line -ForegroundColor Yellow
                    }
                }
            } catch {
                Write-Host "⚠️ keytool no disponible o falló" -ForegroundColor Yellow
            }
            
            # Limpiar archivo temporal
            Remove-Item $tempApk -ErrorAction SilentlyContinue
        }
    }
} catch {
    Write-Host "❌ Error extrayendo APK: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "📋 Resumen de pasos para configurar Google Cloud Console:" -ForegroundColor Cyan
Write-Host "1. Ve a: https://console.cloud.google.com/" -ForegroundColor White
Write-Host "2. Selecciona proyecto: trinity-app-production" -ForegroundColor White
Write-Host "3. Ve a 'APIs & Services' > 'Credentials'" -ForegroundColor White
Write-Host "4. Crea OAuth 2.0 Client ID para Android:" -ForegroundColor White
Write-Host "   - Application type: Android" -ForegroundColor Gray
Write-Host "   - Package name: com.trinity.app" -ForegroundColor Gray
Write-Host "   - SHA-1 certificate fingerprint: [usar el obtenido arriba]" -ForegroundColor Gray
Write-Host "5. Copia el Client ID generado" -ForegroundColor White
Write-Host "6. Actualiza google-services.json" -ForegroundColor White
Write-Host "7. Recompila APK" -ForegroundColor White

Write-Host ""
Write-Host "🔍 Si no pudiste obtener el SHA-1, también puedes:" -ForegroundColor Yellow
Write-Host "- Revisar Expo Dashboard: https://expo.dev/accounts/trinity-apk/projects/trinity/builds" -ForegroundColor White
Write-Host "- Buscar en los detalles del último build" -ForegroundColor White