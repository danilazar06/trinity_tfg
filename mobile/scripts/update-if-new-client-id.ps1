# Script para actualizar google-services.json si hay un nuevo Android Client ID

param(
    [Parameter(Mandatory=$false)]
    [string]$NewAndroidClientId,
    
    [Parameter(Mandatory=$false)]
    [string]$NewSHA1Fingerprint
)

Write-Host "🔧 Actualizar google-services.json con nuevas credenciales" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan

if (-not $NewAndroidClientId -and -not $NewSHA1Fingerprint) {
    Write-Host ""
    Write-Host "📋 USO DEL SCRIPT:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Si obtuviste un NUEVO Android Client ID o SHA-1 del APK real:" -ForegroundColor White
    Write-Host ""
    Write-Host ".\mobile\scripts\update-if-new-client-id.ps1 -NewAndroidClientId 'NUEVO_CLIENT_ID' -NewSHA1Fingerprint 'NUEVO_SHA1'" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Ejemplo:" -ForegroundColor Gray
    Write-Host ".\mobile\scripts\update-if-new-client-id.ps1 -NewAndroidClientId '230498169556-xyz123.apps.googleusercontent.com' -NewSHA1Fingerprint 'AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12'" -ForegroundColor Gray
    
    Write-Host ""
    Write-Host "🔍 INFORMACIÓN ACTUAL:" -ForegroundColor Yellow
    Write-Host "- Android Client ID actual: 230498169556-ipt2iafpd75h17kjcsgmb89oc9u1ciii.apps.googleusercontent.com" -ForegroundColor White
    Write-Host "- SHA-1 configurado: CA:C8:5F:F0:D4:81:27:7C:21:75:94:CD:E1:C3:7E:E9:98:09:93:D7" -ForegroundColor White
    
    return
}

if ($NewAndroidClientId) {
    Write-Host "🔄 Actualizando Android Client ID..." -ForegroundColor Green
    Write-Host "- Nuevo: $NewAndroidClientId" -ForegroundColor White
    
    # Actualizar app.json
    $appJsonPath = "mobile/app.json"
    if (Test-Path $appJsonPath) {
        $appJson = Get-Content $appJsonPath -Raw | ConvertFrom-Json
        $appJson.expo.extra.googleAndroidClientId = $NewAndroidClientId
        $appJson | ConvertTo-Json -Depth 10 | Set-Content $appJsonPath
        Write-Host "✅ app.json actualizado" -ForegroundColor Green
    }
}

if ($NewSHA1Fingerprint) {
    Write-Host "🔄 Actualizando SHA-1 fingerprint..." -ForegroundColor Green
    Write-Host "- Nuevo: $NewSHA1Fingerprint" -ForegroundColor White
    
    # Ejecutar script de actualización de google-services.json
    $clientId = if ($NewAndroidClientId) { $NewAndroidClientId } else { "230498169556-ipt2iafpd75h17kjcsgmb89oc9u1ciii.apps.googleusercontent.com" }
    
    .\mobile\scripts\update-google-services.ps1 -AndroidClientId $clientId -SHA1Fingerprint $NewSHA1Fingerprint
}

Write-Host ""
Write-Host "✅ Actualización completada!" -ForegroundColor Green
Write-Host "🚀 Próximo paso: Recompilar APK con 'eas build --platform android --profile production'" -ForegroundColor Cyan