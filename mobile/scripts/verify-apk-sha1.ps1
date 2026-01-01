# Script para verificar SHA-1 del APK compilado más reciente

Write-Host "🔍 Verificar SHA-1 del APK Compilado" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "📱 PASO 1: Obtener SHA-1 del APK más reciente" -ForegroundColor Yellow
Write-Host ""
Write-Host "Ve a Expo Dashboard:" -ForegroundColor White
Write-Host "https://expo.dev/accounts/trinity-apk/projects/trinity/builds" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Busca tu BUILD MÁS RECIENTE (el que acabas de compilar)" -ForegroundColor Gray
Write-Host "2. Haz clic en el build para ver detalles" -ForegroundColor Gray
Write-Host "3. Busca 'Certificate fingerprint' o 'SHA-1'" -ForegroundColor Gray
Write-Host "4. COMPARA con el SHA-1 configurado:" -ForegroundColor Gray

Write-Host ""
Write-Host "🔍 SHA-1 CONFIGURADO EN GOOGLE CLOUD CONSOLE:" -ForegroundColor Yellow
Write-Host "CA:C8:5F:F0:D4:81:27:7C:21:75:94:CD:E1:C3:7E:E9:98:09:93:D7" -ForegroundColor Green

Write-Host ""
Write-Host "❓ PREGUNTA CRÍTICA:" -ForegroundColor Red
Write-Host "¿El SHA-1 del APK más reciente COINCIDE exactamente con el de arriba?" -ForegroundColor White

Write-Host ""
Write-Host "📋 SI NO COINCIDEN:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. COPIA el SHA-1 real del APK más reciente" -ForegroundColor Gray
Write-Host "2. Ve a Google Cloud Console:" -ForegroundColor Gray
Write-Host "   https://console.cloud.google.com/apis/credentials" -ForegroundColor Cyan
Write-Host "3. Busca tu Android Client ID:" -ForegroundColor Gray
Write-Host "   230498169556-ipt2iafpd75h17kjcsgmb89oc9u1ciii.apps.googleusercontent.com" -ForegroundColor Gray
Write-Host "4. Haz clic en 'Edit' (ícono de lápiz)" -ForegroundColor Gray
Write-Host "5. ACTUALIZA el SHA-1 certificate fingerprint con el valor real" -ForegroundColor Gray
Write-Host "6. Guarda cambios" -ForegroundColor Gray

Write-Host ""
Write-Host "📋 SI COINCIDEN:" -ForegroundColor Yellow
Write-Host ""
Write-Host "El problema puede ser:" -ForegroundColor Gray
Write-Host "1. Google Cloud Console no ha propagado los cambios (espera 5-10 minutos)" -ForegroundColor Gray
Write-Host "2. Configuración incorrecta en Google Cloud Console" -ForegroundColor Gray
Write-Host "3. Problema con el project number o package name" -ForegroundColor Gray

Write-Host ""
Write-Host "🔧 VERIFICACIÓN ADICIONAL:" -ForegroundColor Yellow
Write-Host ""
Write-Host "En Google Cloud Console, verifica que tu Android Client ID tenga:" -ForegroundColor White
Write-Host "- Application type: Android" -ForegroundColor Gray
Write-Host "- Package name: com.trinity.app" -ForegroundColor Gray
Write-Host "- SHA-1 certificate fingerprint: [EL SHA-1 REAL DEL APK]" -ForegroundColor Gray

Write-Host ""
Write-Host "💡 CONSEJO:" -ForegroundColor Cyan
Write-Host "Si el SHA-1 cambió, es normal. Expo puede generar diferentes certificados." -ForegroundColor White
Write-Host "Lo importante es usar el SHA-1 del APK que realmente instalaste." -ForegroundColor White