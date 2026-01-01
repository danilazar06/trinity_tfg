# Guía completa para resolver DEVELOPER_ERROR con SHA-1 correcto

Write-Host "🔧 RESOLVER DEVELOPER_ERROR - SHA-1 Correcto" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "✅ PROBLEMA IDENTIFICADO:" -ForegroundColor Green
Write-Host "El SHA-1 en Google Cloud Console no coincide con el del APK real" -ForegroundColor White

Write-Host ""
Write-Host "📋 SHA-1 CORRECTO DEL APK:" -ForegroundColor Yellow
Write-Host "0C:5D:53:D3:A9:6C:81:A7:90:21:AD:C5:5E:9B:46:A6:AF:05:B8:9F" -ForegroundColor Green

Write-Host ""
Write-Host "🌐 PASOS EN GOOGLE CLOUD CONSOLE:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Ve a: https://console.cloud.google.com/apis/credentials" -ForegroundColor White
Write-Host ""
Write-Host "2. Busca tu Android Client ID:" -ForegroundColor White
Write-Host "   230498169556-ipt2iafpd75h17kjcsgmb89oc9u1ciii.apps.googleusercontent.com" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Haz clic en el ícono de EDITAR (lápiz) al lado del Client ID" -ForegroundColor White
Write-Host ""
Write-Host "4. En la sección 'SHA-1 certificate fingerprint':" -ForegroundColor White
Write-Host "   - BORRA el SHA-1 anterior" -ForegroundColor Gray
Write-Host "   - PEGA el nuevo SHA-1:" -ForegroundColor Gray
Write-Host "     0C:5D:53:D3:A9:6C:81:A7:90:21:AD:C5:5E:9B:46:A6:AF:05:B8:9F" -ForegroundColor Green
Write-Host ""
Write-Host "5. Verifica que los otros campos sean:" -ForegroundColor White
Write-Host "   - Application type: Android" -ForegroundColor Gray
Write-Host "   - Package name: com.trinity.app" -ForegroundColor Gray
Write-Host ""
Write-Host "6. Haz clic 'SAVE' o 'GUARDAR'" -ForegroundColor White

Write-Host ""
Write-Host "⏰ TIEMPO DE PROPAGACIÓN:" -ForegroundColor Yellow
Write-Host "- Google necesita 5-15 minutos para propagar los cambios" -ForegroundColor White
Write-Host "- NO recompiles el APK todavía" -ForegroundColor White
Write-Host "- Usa el mismo APK que ya instalaste" -ForegroundColor White

Write-Host ""
Write-Host "🧪 PRUEBA:" -ForegroundColor Yellow
Write-Host "1. Espera 10-15 minutos después de guardar en Google Cloud Console" -ForegroundColor White
Write-Host "2. Abre Trinity en tu dispositivo" -ForegroundColor White
Write-Host "3. Intenta Google Sign-In" -ForegroundColor White
Write-Host "4. El DEVELOPER_ERROR debería desaparecer" -ForegroundColor White

Write-Host ""
Write-Host "✅ ARCHIVOS YA ACTUALIZADOS:" -ForegroundColor Green
Write-Host "- google-services.json ✅" -ForegroundColor White
Write-Host "- Certificate hash: 0c5d53d3a96c81a79021adc55e9b46a6af05b89f ✅" -ForegroundColor White

Write-Host ""
Write-Host "🎯 RESULTADO ESPERADO:" -ForegroundColor Cyan
Write-Host "- Google Sign-In funcionará correctamente" -ForegroundColor White
Write-Host "- Los usuarios se crearán automáticamente en AWS Cognito" -ForegroundColor White
Write-Host "- No más DEVELOPER_ERROR" -ForegroundColor White

Write-Host ""
Write-Host "❗ IMPORTANTE:" -ForegroundColor Red
Write-Host "- NO cambies el Web Client ID en AWS Cognito" -ForegroundColor White
Write-Host "- Solo actualiza el SHA-1 en Google Cloud Console" -ForegroundColor White
Write-Host "- El Android Client ID ya es correcto" -ForegroundColor White