# ========================================
# TRINITY - CONFIGURACIÓN COMPLETA DEL ENTORNO (PowerShell)
# ========================================
# Este script configura completamente el entorno para Trinity
# incluyendo AWS AppSync, Cognito, Google OAuth y todas las dependencias

param(
    [Parameter(Mandatory=$false)]
    [string]$Stage = "dev"
)

# Configuración de colores
$Host.UI.RawUI.ForegroundColor = "White"

function Write-Log {
    param([string]$Message)
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] WARNING: $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] ERROR: $Message" -ForegroundColor Red
}

# Verificar dependencias
function Test-Dependencies {
    Write-Log "Verificando dependencias..."
    
    # Verificar AWS CLI
    try {
        $null = aws --version
        Write-Log "✅ AWS CLI encontrado"
    }
    catch {
        Write-Error "AWS CLI no está instalado. Instálalo desde: https://aws.amazon.com/cli/"
        exit 1
    }
    
    # Verificar Node.js
    try {
        $null = node --version
        Write-Log "✅ Node.js encontrado"
    }
    catch {
        Write-Error "Node.js no está instalado. Instálalo desde: https://nodejs.org/"
        exit 1
    }
    
    # Verificar npm
    try {
        $null = npm --version
        Write-Log "✅ npm encontrado"
    }
    catch {
        Write-Error "npm no está instalado."
        exit 1
    }
    
    Write-Log "✅ Todas las dependencias están instaladas"
}

# Verificar configuración de AWS
function Test-AWSConfig {
    Write-Log "Verificando configuración de AWS..."
    
    try {
        $identity = aws sts get-caller-identity --output json | ConvertFrom-Json
        $script:AccountId = $identity.Account
        $script:Region = aws configure get region
        
        Write-Log "✅ AWS configurado correctamente"
        Write-Log "   Account ID: $script:AccountId"
        Write-Log "   Region: $script:Region"
    }
    catch {
        Write-Error "AWS CLI no está configurado correctamente. Ejecuta 'aws configure'"
        exit 1
    }
}

# Obtener outputs de CloudFormation
function Get-CloudFormationOutputs {
    Write-Log "Obteniendo outputs de CloudFormation..."
    
    $stackName = "TrinityMvpStack"
    
    try {
        $outputs = aws cloudformation describe-stacks --stack-name $stackName --query "Stacks[0].Outputs" --output json | ConvertFrom-Json
        
        # Extraer valores específicos
        $script:GraphQLApiUrl = ($outputs | Where-Object { $_.OutputKey -eq "GraphQLApiUrl" }).OutputValue
        $script:GraphQLApiId = ($outputs | Where-Object { $_.OutputKey -eq "GraphQLApiId" }).OutputValue
        $script:UserPoolId = ($outputs | Where-Object { $_.OutputKey -eq "UserPoolId" }).OutputValue
        
        # Construir realtime endpoint
        $script:RealtimeEndpoint = "wss://$script:GraphQLApiId.appsync-realtime-api.$script:Region.amazonaws.com/graphql"
        
        Write-Log "✅ Outputs obtenidos correctamente"
        Write-Log "   GraphQL URL: $script:GraphQLApiUrl"
        Write-Log "   Realtime URL: $script:RealtimeEndpoint"
        Write-Log "   User Pool ID: $script:UserPoolId"
    }
    catch {
        Write-Error "Stack $stackName no encontrado. Asegúrate de que la infraestructura esté desplegada."
        exit 1
    }
}

# Actualizar configuración de AWS en mobile
function Update-MobileAWSConfig {
    Write-Log "Actualizando configuración de AWS en mobile..."
    
    $awsConfigFile = "mobile/src/config/aws-config.ts"
    
    if (-not (Test-Path $awsConfigFile)) {
        Write-Error "Archivo $awsConfigFile no encontrado"
        exit 1
    }
    
    # Crear backup
    Copy-Item $awsConfigFile "$awsConfigFile.backup"
    
    # Leer contenido
    $content = Get-Content $awsConfigFile -Raw
    
    # Actualizar configuración
    $content = $content -replace "graphqlEndpoint: '.*'", "graphqlEndpoint: '$script:GraphQLApiUrl'"
    $content = $content -replace "realtimeEndpoint: '.*'", "realtimeEndpoint: '$script:RealtimeEndpoint'"
    $content = $content -replace "userPoolId: '.*'", "userPoolId: '$script:UserPoolId'"
    
    # Escribir contenido actualizado
    Set-Content $awsConfigFile $content
    
    Write-Log "✅ Configuración de AWS actualizada en mobile"
}

# Instalar dependencias de mobile
function Install-MobileDependencies {
    Write-Log "Instalando dependencias de mobile..."
    
    Push-Location mobile
    
    if (-not (Test-Path "package.json")) {
        Write-Error "package.json no encontrado en mobile/"
        exit 1
    }
    
    npm install
    
    # Instalar dependencias específicas para Google Sign-In
    npm install @react-native-google-signin/google-signin
    npm install @react-native-async-storage/async-storage
    
    Pop-Location
    
    Write-Log "✅ Dependencias de mobile instaladas"
}

# Instalar dependencias de backend
function Install-BackendDependencies {
    Write-Log "Instalando dependencias de backend..."
    
    Push-Location backend
    
    if (-not (Test-Path "package.json")) {
        Write-Error "package.json no encontrado en backend/"
        exit 1
    }
    
    npm install
    
    Pop-Location
    
    Write-Log "✅ Dependencias de backend instaladas"
}

# Verificar configuración de Google OAuth
function Test-GoogleOAuth {
    Write-Log "Verificando configuración de Google OAuth..."
    
    $envContent = Get-Content .env -Raw
    
    if ($envContent -match "YOUR_GOOGLE.*CLIENT_ID") {
        Write-Warning "Las credenciales de Google OAuth no están configuradas en .env"
        Write-Warning "Por favor, configura las siguientes variables:"
        Write-Warning "  - GOOGLE_WEB_CLIENT_ID"
        Write-Warning "  - GOOGLE_IOS_CLIENT_ID"
        Write-Warning "  - GOOGLE_ANDROID_CLIENT_ID"
        Write-Warning "  - GOOGLE_CLIENT_SECRET"
    }
    else {
        Write-Log "✅ Credenciales de Google OAuth configuradas"
    }
}

# Verificar configuración de mobile
function Test-MobileConfig {
    Write-Log "Verificando configuración de mobile..."
    
    # Verificar app.json
    if (Test-Path "mobile/app.json") {
        $appJsonContent = Get-Content "mobile/app.json" -Raw
        if ($appJsonContent -match "YOUR_GOOGLE") {
            Write-Warning "Algunas credenciales de Google en mobile/app.json necesitan configuración"
        }
        else {
            Write-Log "✅ app.json configurado correctamente"
        }
    }
    
    # Verificar google-services.json
    if (Test-Path "mobile/google-services.json") {
        Write-Log "✅ google-services.json encontrado"
    }
    else {
        Write-Warning "google-services.json no encontrado en mobile/"
    }
}

# Ejecutar tests de configuración
function Test-Configuration {
    Write-Log "Ejecutando tests de configuración..."
    
    # Test de conectividad con AWS
    try {
        $null = aws sts get-caller-identity
        Write-Log "✅ Conectividad con AWS OK"
    }
    catch {
        Write-Error "❌ Problema de conectividad con AWS"
    }
    
    # Test de configuración de Cognito
    if ($script:UserPoolId -and $script:UserPoolId -ne "null") {
        Write-Log "✅ User Pool ID configurado: $script:UserPoolId"
    }
    else {
        Write-Error "❌ User Pool ID no configurado correctamente"
    }
    
    # Test de configuración de GraphQL
    if ($script:GraphQLApiUrl -and $script:GraphQLApiUrl -ne "null") {
        Write-Log "✅ GraphQL API URL configurada: $script:GraphQLApiUrl"
    }
    else {
        Write-Error "❌ GraphQL API URL no configurada correctamente"
    }
}

# Generar resumen de configuración
function New-ConfigSummary {
    Write-Log "Generando resumen de configuración..."
    
    $googleWebClientId = (Get-Content .env | Where-Object { $_ -match "GOOGLE_WEB_CLIENT_ID=" }) -replace "GOOGLE_WEB_CLIENT_ID=", ""
    $googleIosClientId = (Get-Content .env | Where-Object { $_ -match "GOOGLE_IOS_CLIENT_ID=" }) -replace "GOOGLE_IOS_CLIENT_ID=", ""
    $googleAndroidClientId = (Get-Content .env | Where-Object { $_ -match "GOOGLE_ANDROID_CLIENT_ID=" }) -replace "GOOGLE_ANDROID_CLIENT_ID=", ""
    
    $summary = @"
# Trinity - Resumen de Configuración

## AWS Configuration
- **Account ID**: $script:AccountId
- **Region**: $script:Region
- **GraphQL API URL**: $script:GraphQLApiUrl
- **Realtime Endpoint**: $script:RealtimeEndpoint
- **User Pool ID**: $script:UserPoolId

## Google OAuth Configuration
- **Web Client ID**: $googleWebClientId
- **iOS Client ID**: $googleIosClientId
- **Android Client ID**: $googleAndroidClientId

## Next Steps
1. Verificar que todas las credenciales de Google OAuth estén configuradas
2. Compilar la aplicación mobile: ``cd mobile && eas build -p android --profile preview``
3. Iniciar el backend: ``cd backend && npm run start:dev``
4. Probar la autenticación con Google Sign-In

## Archivos Modificados
- ``.env``
- ``backend/.env``
- ``mobile/src/config/aws-config.ts``
- ``mobile/app.json``
- ``mobile/google-services.json``

## Troubleshooting
Si encuentras problemas:
1. Verifica que AWS CLI esté configurado correctamente
2. Asegúrate de que la infraestructura esté desplegada
3. Revisa los logs de CloudFormation para errores
4. Verifica que las credenciales de Google OAuth sean válidas

Fecha de configuración: $(Get-Date)
"@

    Set-Content "config-summary.md" $summary
    
    Write-Log "✅ Resumen de configuración generado: config-summary.md"
}

# Función principal
function Main {
    Write-Log "🚀 Iniciando configuración completa de Trinity..."
    
    Test-Dependencies
    Test-AWSConfig
    Get-CloudFormationOutputs
    Update-MobileAWSConfig
    Install-MobileDependencies
    Install-BackendDependencies
    Test-GoogleOAuth
    Test-MobileConfig
    Test-Configuration
    New-ConfigSummary
    
    Write-Log "🎉 Configuración completa finalizada!"
    Write-Log ""
    Write-Log "📋 Próximos pasos:"
    Write-Log "1. Revisar config-summary.md para detalles de la configuración"
    Write-Log "2. Configurar credenciales de Google OAuth si es necesario"
    Write-Log "3. Compilar la aplicación mobile"
    Write-Log "4. Iniciar el backend y probar la aplicación"
    Write-Log ""
    Write-Log "🔧 Para compilar la app mobile:"
    Write-Log "   cd mobile && eas build -p android --profile preview"
    Write-Log ""
    Write-Log "🚀 Para iniciar el backend:"
    Write-Log "   cd backend && npm run start:dev"
}

# Ejecutar función principal
Main