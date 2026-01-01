# Script para obtener SHA-1 fingerprint desde el dispositivo Android

Write-Host "🔍 Obteniendo SHA-1 fingerprint desde dispositivo..." -ForegroundColor Cyan

# Verificar ADB
try {
    $null = adb version 2>$null
    Write-Host "✅ ADB disponible" -ForegroundColor Green
} catch {
    Write-Host "❌ ADB no encontrado. Instala Android SDK Platform Tools" -ForegroundColor Red
    exit 1
}

# Verificar dispositivo conectado
$devices = adb devices 2>$null
if ($devices -match "device$") {
    Write-Host "✅ Dispositivo conectado" -ForegroundColor Green
} else {
    Write-Host "❌ No hay dispositivos conectados. Conecta por USB y habilita depuración USB" -ForegroundColor Red
    exit 1
}

# Verificar Trinity instalada
$trinityPackage = adb shell pm list packages | Select-String "com.trinity.app"
if ($trinityPackage) {
    Write-Host "✅ Trinity encontrada" -ForegroundColor Green
} else {
    Write-Host "❌ Trinity no instalada. Instala el APK primero" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🔐 Obteniendo certificado..." -ForegroundColor Yellow

# Obtener path del APK
$apkPath = adb shell pm path com.trinity.app | ForEach-Object { $_.Replace("package:", "").Trim() }
Write-Host "📦 APK ubicado en: $apkPath"

# Copiar APK temporalmente
$tempApk = "trinity-temp.apk"
Write-Host "📥 Copiando APK..."
adb pull $apkPath $tempApk 2>$null

if (Test-Path $tempApk) {
    Write-Host "✅ APK copiado" -ForegroundColor Green
    
    # Extraer certificado
    Write-Host "🔍 Extrayendo certificado..."
    
    try {
        # Usar keytool para obtener el certificado
        $certInfo = keytool -printcert -jarfile $tempApk 2>$null
        
        if ($certInfo) {
            Write-Host ""
            Write-Host "🎯 CERTIFICADO ENCONTRADO:" -ForegroundColor Green
            Write-Host $certInfo
            
            # Buscar SHA-1 específicamente
            $sha1Line = $certInfo | Select-String "SHA1"
            if ($sha1Line) {
                $sha1Value = ($sha1Line -split ":")[1].Trim()
                Write-Host ""
                Write-Host "🔑 SHA-1 FINGERPRINT:" -ForegroundColor Yellow
                Write-Host $sha1Value -ForegroundColor White
                
                # Guardar en archivo
                @{
                    sha1 = $sha1Value
                    timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
                    packageName = "com.trinity.app"
                    apkPath = $apkPath
                } | ConvertTo-Json | Out-File "sha1-fingerprint.json"
                
                Write-Host ""
                Write-Host "📝 SHA-1 guardado en sha1-fingerprint.json" -ForegroundColor Green
                
                Write-Host ""
                Write-Host "🚀 PRÓXIMOS PASOS:" -ForegroundColor Cyan
                Write-Host "1. Ve a: https://console.cloud.google.com/" -ForegroundColor White
                Write-Host "2. Selecciona proyecto: trinity-app-production" -ForegroundColor White
                Write-Host "3. Ve a 'APIs & Services' > 'Credentials'" -ForegroundColor White
                Write-Host "4. Busca 'OAuth 2.0 Client IDs'" -ForegroundColor White
                Write-Host "5. Crea NUEVO 'OAuth 2.0 Client ID' para Android:" -ForegroundColor White
                Write-Host "   - Application type: Android" -ForegroundColor Gray
                Write-Host "   - Package name: com.trinity.app" -ForegroundColor Gray
                Write-Host "   - SHA-1 certificate fingerprint: $sha1Value" -ForegroundColor Gray
                Write-Host "6. Copia el Client ID generado" -ForegroundColor White
                Write-Host "7. Actualiza google-services.json con el nuevo Client ID" -ForegroundColor White
                Write-Host "8. Recompila APK" -ForegroundColor White
                
            } else {
                Write-Host "❌ No se encontró SHA-1 en el certificado" -ForegroundColor Red
            }
        } else {
            Write-Host "❌ No se pudo extraer certificado con keytool" -ForegroundColor Red
        }
    } catch {
        Write-Host "❌ Error con keytool: $_" -ForegroundColor Red
        Write-Host "💡 Instala Java JDK para usar keytool" -ForegroundColor Yellow
    }
    
    # Limpiar archivo temporal
    Remove-Item $tempApk -ErrorAction SilentlyContinue
    
} else {
    Write-Host "❌ No se pudo copiar APK" -ForegroundColor Red
}

Write-Host ""
Write-Host "📋 RESUMEN DEL PROBLEMA:" -ForegroundColor Cyan
Write-Host "- Error: DEVELOPER_ERROR" -ForegroundColor White
Write-Host "- Causa: SHA-1 fingerprint no configurado en Google Cloud Console" -ForegroundColor White
Write-Host "- Solución: Configurar SHA-1 en Google Cloud Console" -ForegroundColor White
Write-Host "- Package name: com.trinity.app" -ForegroundColor White