# Verificación Completa de Configuración de Google Sign-In
# Este script verifica toda la configuración necesaria para Google Sign-In

Write-Host "🔍 VERIFICACIÓN COMPLETA DE GOOGLE SIGN-IN" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$errors = @()
$warnings = @()
$success = @()

Write-Host ""
Write-Host "📋 VERIFICANDO CONFIGURACIÓN..." -ForegroundColor Yellow

# 1. Verificar app.json
Write-Host ""
Write-Host "1️⃣ Verificando app.json..." -ForegroundColor Yellow

$appJsonPath = "app.json"
if (Test-Path $appJsonPath) {
    try {
        $appJson = Get-Content $appJsonPath | ConvertFrom-Json
        
        # Verificar package name
        $packageName = $appJson.expo.android.package
        if ($packageName -eq "com.trinity.app") {
            $success += "✅ Package name correcto: $packageName"
        } else {
            $errors += "❌ Package name incorrecto: $packageName (debe ser: com.trinity.app)"
        }
        
        # Verificar Google Client IDs
        $webClientId = $appJson.expo.extra.googleWebClientId
        $androidClientId = $appJson.expo.extra.googleAndroidClientId
        $iosClientId = $appJson.expo.extra.googleIosClientId
        
        if ($webClientId -and $webClientId -ne "your_google_web_client_id_here") {
            $success += "✅ Google Web Client ID configurado"
        } else {
            $errors += "❌ Google Web Client ID no configurado o usa valor por defecto"
        }
        
        if ($androidClientId -and $androidClientId -ne "YOUR_GOOGLE_ANDROID_CLIENT_ID") {
            $success += "✅ Google Android Client ID configurado"
        } else {
            $errors += "❌ Google Android Client ID no configurado o usa valor por defecto"
        }
        
        # Verificar plugin de Google Sign-In
        $hasGooglePlugin = $false
        if ($appJson.expo.plugins) {
            foreach ($plugin in $appJson.expo.plugins) {
                if ($plugin -is [string] -and $plugin -eq "@react-native-google-signin/google-signin") {
                    $hasGooglePlugin = $true
                    break
                } elseif ($plugin -is [array] -and $plugin[0] -eq "@react-native-google-signin/google-signin") {
                    $hasGooglePlugin = $true
                    break
                }
            }
        }
        
        if ($hasGooglePlugin) {
            $success += "✅ Plugin de Google Sign-In configurado en app.json"
        } else {
            $errors += "❌ Plugin de Google Sign-In no encontrado en app.json"
        }
        
    } catch {
        $errors += "❌ Error leyendo app.json: $($_.Exception.Message)"
    }
} else {
    $errors += "❌ app.json no encontrado"
}

# 2. Verificar archivos .env
Write-Host ""
Write-Host "2️⃣ Verificando archivos .env..." -ForegroundColor Yellow

$rootEnvPath = "../.env"
if (Test-Path $rootEnvPath) {
    $envContent = Get-Content $rootEnvPath
    $hasGoogleWebClientId = $envContent | Where-Object { $_ -match "^GOOGLE_WEB_CLIENT_ID=" }
    
    if ($hasGoogleWebClientId) {
        $success += "✅ GOOGLE_WEB_CLIENT_ID encontrado en .env raíz"
    } else {
        $warnings += "⚠️ GOOGLE_WEB_CLIENT_ID no encontrado en .env raíz"
    }
} else {
    $warnings += "⚠️ .env no encontrado en directorio raíz"
}

# 3. Verificar keystore de debug
Write-Host ""
Write-Host "3️⃣ Verificando keystore de debug..." -ForegroundColor Yellow

$keystorePaths = @(
    "$env:USERPROFILE\.android\debug.keystore",
    "$env:HOME/.android/debug.keystore"
)

$keystoreFound = $false
foreach ($path in $keystorePaths) {
    if (Test-Path $path) {
        $success += "✅ Debug keystore encontrado: $path"
        $keystoreFound = $true
        break
    }
}

if (-not $keystoreFound) {
    $warnings += "⚠️ Debug keystore no encontrado. Ejecuta 'npx expo run:android' primero"
}

# 4. Verificar dependencias de Node.js
Write-Host ""
Write-Host "4️⃣ Verificando dependencias..." -ForegroundColor Yellow

$packageJsonPath = "package.json"
if (Test-Path $packageJsonPath) {
    try {
        $packageJson = Get-Content $packageJsonPath | ConvertFrom-Json
        
        $hasGoogleSignIn = $packageJson.dependencies.'@react-native-google-signin/google-signin'
        if ($hasGoogleSignIn) {
            $success += "✅ @react-native-google-signin/google-signin instalado: $hasGoogleSignIn"
        } else {
            $errors += "❌ @react-native-google-signin/google-signin no instalado"
        }
        
        $hasExpoRouter = $packageJson.dependencies.'expo-router'
        if ($hasExpoRouter) {
            $success += "✅ expo-router instalado: $hasExpoRouter"
        } else {
            $warnings += "⚠️ expo-router no encontrado"
        }
        
    } catch {
        $errors += "❌ Error leyendo package.json: $($_.Exception.Message)"
    }
} else {
    $errors += "❌ package.json no encontrado"
}

# 5. Verificar herramientas del sistema
Write-Host ""
Write-Host "5️⃣ Verificando herramientas del sistema..." -ForegroundColor Yellow

# Verificar Java/keytool
try {
    $keytoolVersion = & keytool -help 2>&1 | Select-Object -First 1
    $success += "✅ keytool disponible (Java instalado)"
} catch {
    $warnings += "⚠️ keytool no disponible. Instala Java JDK"
}

# Verificar Expo CLI
try {
    $expoVersion = & npx expo --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        $success += "✅ Expo CLI disponible"
    } else {
        $warnings += "⚠️ Expo CLI no disponible"
    }
} catch {
    $warnings += "⚠️ Expo CLI no disponible"
}

# 6. Mostrar resultados
Write-Host ""
Write-Host "📊 RESULTADOS DE LA VERIFICACIÓN" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

if ($success.Count -gt 0) {
    Write-Host ""
    Write-Host "✅ CONFIGURACIONES CORRECTAS:" -ForegroundColor Green
    foreach ($item in $success) {
        Write-Host "   $item" -ForegroundColor Green
    }
}

if ($warnings.Count -gt 0) {
    Write-Host ""
    Write-Host "⚠️ ADVERTENCIAS:" -ForegroundColor Yellow
    foreach ($item in $warnings) {
        Write-Host "   $item" -ForegroundColor Yellow
    }
}

if ($errors.Count -gt 0) {
    Write-Host ""
    Write-Host "❌ ERRORES CRÍTICOS:" -ForegroundColor Red
    foreach ($item in $errors) {
        Write-Host "   $item" -ForegroundColor Red
    }
}

# 7. Recomendaciones
Write-Host ""
Write-Host "🎯 RECOMENDACIONES:" -ForegroundColor Cyan

if ($errors.Count -gt 0) {
    Write-Host ""
    Write-Host "🚨 ACCIÓN REQUERIDA - Errores críticos encontrados:" -ForegroundColor Red
    Write-Host "1. Corrige los errores listados arriba" -ForegroundColor White
    Write-Host "2. Ejecuta este script nuevamente para verificar" -ForegroundColor White
    Write-Host "3. Una vez sin errores, configura Google Cloud Console" -ForegroundColor White
} elseif ($warnings.Count -gt 0) {
    Write-Host ""
    Write-Host "⚠️ CONFIGURACIÓN PARCIAL - Algunas advertencias:" -ForegroundColor Yellow
    Write-Host "1. Revisa las advertencias (pueden ser opcionales)" -ForegroundColor White
    Write-Host "2. Procede con la configuración de Google Cloud Console" -ForegroundColor White
    Write-Host "3. Ejecuta: ./get-sha1-fingerprint.ps1" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "🎉 CONFIGURACIÓN COMPLETA - Todo listo!" -ForegroundColor Green
    Write-Host "1. Ejecuta: ./get-sha1-fingerprint.ps1" -ForegroundColor Cyan
    Write-Host "2. Configura el SHA-1 en Google Cloud Console" -ForegroundColor White
    Write-Host "3. Prueba Google Sign-In en la app" -ForegroundColor White
}

Write-Host ""
Write-Host "📋 PRÓXIMOS PASOS:" -ForegroundColor Cyan
Write-Host "1. ./get-sha1-fingerprint.ps1 - Obtener SHA-1" -ForegroundColor Gray
Write-Host "2. Configurar Google Cloud Console con el SHA-1" -ForegroundColor Gray
Write-Host "3. npx expo start --clear - Limpiar y reiniciar" -ForegroundColor Gray
Write-Host "4. Probar Google Sign-In en la app" -ForegroundColor Gray

# Código de salida
if ($errors.Count -gt 0) {
    exit 1
} else {
    exit 0
}