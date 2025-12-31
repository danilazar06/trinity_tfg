#!/bin/bash

# ========================================
# TRINITY - CONFIGURACIÓN COMPLETA DEL ENTORNO
# ========================================
# Este script configura completamente el entorno para Trinity
# incluyendo AWS AppSync, Cognito, Google OAuth y todas las dependencias

set -e

echo "🚀 Iniciando configuración completa del entorno Trinity..."

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Función para logging
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
}

# Verificar dependencias
check_dependencies() {
    log "Verificando dependencias..."
    
    if ! command -v aws &> /dev/null; then
        error "AWS CLI no está instalado. Instálalo desde: https://aws.amazon.com/cli/"
        exit 1
    fi
    
    if ! command -v node &> /dev/null; then
        error "Node.js no está instalado. Instálalo desde: https://nodejs.org/"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        error "npm no está instalado."
        exit 1
    fi
    
    log "✅ Todas las dependencias están instaladas"
}

# Verificar configuración de AWS
check_aws_config() {
    log "Verificando configuración de AWS..."
    
    if ! aws sts get-caller-identity &> /dev/null; then
        error "AWS CLI no está configurado correctamente. Ejecuta 'aws configure'"
        exit 1
    fi
    
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    REGION=$(aws configure get region)
    
    log "✅ AWS configurado correctamente"
    log "   Account ID: $ACCOUNT_ID"
    log "   Region: $REGION"
}

# Obtener outputs de CloudFormation
get_cloudformation_outputs() {
    log "Obteniendo outputs de CloudFormation..."
    
    STACK_NAME="TrinityMvpStack"
    
    if ! aws cloudformation describe-stacks --stack-name "$STACK_NAME" &> /dev/null; then
        error "Stack $STACK_NAME no encontrado. Asegúrate de que la infraestructura esté desplegada."
        exit 1
    fi
    
    # Obtener outputs
    OUTPUTS=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query "Stacks[0].Outputs" --output json)
    
    # Extraer valores específicos
    GRAPHQL_API_URL=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="GraphQLApiUrl") | .OutputValue')
    GRAPHQL_API_ID=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="GraphQLApiId") | .OutputValue')
    USER_POOL_ID=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="UserPoolId") | .OutputValue')
    
    # Construir realtime endpoint
    REALTIME_ENDPOINT="wss://${GRAPHQL_API_ID}.appsync-realtime-api.${REGION}.amazonaws.com/graphql"
    
    log "✅ Outputs obtenidos correctamente"
    log "   GraphQL URL: $GRAPHQL_API_URL"
    log "   Realtime URL: $REALTIME_ENDPOINT"
    log "   User Pool ID: $USER_POOL_ID"
}

# Actualizar configuración de AWS en mobile
update_mobile_aws_config() {
    log "Actualizando configuración de AWS en mobile..."
    
    AWS_CONFIG_FILE="mobile/src/config/aws-config.ts"
    
    if [ ! -f "$AWS_CONFIG_FILE" ]; then
        error "Archivo $AWS_CONFIG_FILE no encontrado"
        exit 1
    fi
    
    # Crear backup
    cp "$AWS_CONFIG_FILE" "$AWS_CONFIG_FILE.backup"
    
    # Actualizar configuración
    sed -i.tmp "s|graphqlEndpoint: '.*'|graphqlEndpoint: '$GRAPHQL_API_URL'|g" "$AWS_CONFIG_FILE"
    sed -i.tmp "s|realtimeEndpoint: '.*'|realtimeEndpoint: '$REALTIME_ENDPOINT'|g" "$AWS_CONFIG_FILE"
    sed -i.tmp "s|userPoolId: '.*'|userPoolId: '$USER_POOL_ID'|g" "$AWS_CONFIG_FILE"
    
    # Limpiar archivos temporales
    rm -f "$AWS_CONFIG_FILE.tmp"
    
    log "✅ Configuración de AWS actualizada en mobile"
}

# Instalar dependencias de mobile
install_mobile_dependencies() {
    log "Instalando dependencias de mobile..."
    
    cd mobile
    
    if [ ! -f "package.json" ]; then
        error "package.json no encontrado en mobile/"
        exit 1
    fi
    
    npm install
    
    # Instalar dependencias específicas para Google Sign-In
    npm install @react-native-google-signin/google-signin
    npm install @react-native-async-storage/async-storage
    
    cd ..
    
    log "✅ Dependencias de mobile instaladas"
}

# Instalar dependencias de backend
install_backend_dependencies() {
    log "Instalando dependencias de backend..."
    
    cd backend
    
    if [ ! -f "package.json" ]; then
        error "package.json no encontrado en backend/"
        exit 1
    fi
    
    npm install
    
    cd ..
    
    log "✅ Dependencias de backend instaladas"
}

# Verificar configuración de Google OAuth
verify_google_oauth() {
    log "Verificando configuración de Google OAuth..."
    
    # Verificar que las credenciales de Google estén configuradas
    if grep -q "YOUR_GOOGLE.*CLIENT_ID" .env; then
        warn "Las credenciales de Google OAuth no están configuradas en .env"
        warn "Por favor, configura las siguientes variables:"
        warn "  - GOOGLE_WEB_CLIENT_ID"
        warn "  - GOOGLE_IOS_CLIENT_ID"
        warn "  - GOOGLE_ANDROID_CLIENT_ID"
        warn "  - GOOGLE_CLIENT_SECRET"
    else
        log "✅ Credenciales de Google OAuth configuradas"
    fi
}

# Verificar configuración de mobile
verify_mobile_config() {
    log "Verificando configuración de mobile..."
    
    # Verificar app.json
    if [ -f "mobile/app.json" ]; then
        if grep -q "YOUR_GOOGLE" mobile/app.json; then
            warn "Algunas credenciales de Google en mobile/app.json necesitan configuración"
        else
            log "✅ app.json configurado correctamente"
        fi
    fi
    
    # Verificar google-services.json
    if [ -f "mobile/google-services.json" ]; then
        log "✅ google-services.json encontrado"
    else
        warn "google-services.json no encontrado en mobile/"
    fi
}

# Ejecutar tests de configuración
run_config_tests() {
    log "Ejecutando tests de configuración..."
    
    # Test de conectividad con AWS
    if aws sts get-caller-identity &> /dev/null; then
        log "✅ Conectividad con AWS OK"
    else
        error "❌ Problema de conectividad con AWS"
    fi
    
    # Test de configuración de Cognito
    if [ -n "$USER_POOL_ID" ] && [ "$USER_POOL_ID" != "null" ]; then
        log "✅ User Pool ID configurado: $USER_POOL_ID"
    else
        error "❌ User Pool ID no configurado correctamente"
    fi
    
    # Test de configuración de GraphQL
    if [ -n "$GRAPHQL_API_URL" ] && [ "$GRAPHQL_API_URL" != "null" ]; then
        log "✅ GraphQL API URL configurada: $GRAPHQL_API_URL"
    else
        error "❌ GraphQL API URL no configurada correctamente"
    fi
}

# Generar resumen de configuración
generate_config_summary() {
    log "Generando resumen de configuración..."
    
    cat > config-summary.md << EOF
# Trinity - Resumen de Configuración

## AWS Configuration
- **Account ID**: $ACCOUNT_ID
- **Region**: $REGION
- **GraphQL API URL**: $GRAPHQL_API_URL
- **Realtime Endpoint**: $REALTIME_ENDPOINT
- **User Pool ID**: $USER_POOL_ID

## Google OAuth Configuration
- **Web Client ID**: $(grep GOOGLE_WEB_CLIENT_ID .env | cut -d'=' -f2)
- **iOS Client ID**: $(grep GOOGLE_IOS_CLIENT_ID .env | cut -d'=' -f2)
- **Android Client ID**: $(grep GOOGLE_ANDROID_CLIENT_ID .env | cut -d'=' -f2)

## Next Steps
1. Verificar que todas las credenciales de Google OAuth estén configuradas
2. Compilar la aplicación mobile: \`cd mobile && eas build -p android --profile preview\`
3. Iniciar el backend: \`cd backend && npm run start:dev\`
4. Probar la autenticación con Google Sign-In

## Archivos Modificados
- \`.env\`
- \`backend/.env\`
- \`mobile/src/config/aws-config.ts\`
- \`mobile/app.json\`
- \`mobile/google-services.json\`

## Troubleshooting
Si encuentras problemas:
1. Verifica que AWS CLI esté configurado correctamente
2. Asegúrate de que la infraestructura esté desplegada
3. Revisa los logs de CloudFormation para errores
4. Verifica que las credenciales de Google OAuth sean válidas

Fecha de configuración: $(date)
EOF

    log "✅ Resumen de configuración generado: config-summary.md"
}

# Función principal
main() {
    log "🚀 Iniciando configuración completa de Trinity..."
    
    check_dependencies
    check_aws_config
    get_cloudformation_outputs
    update_mobile_aws_config
    install_mobile_dependencies
    install_backend_dependencies
    verify_google_oauth
    verify_mobile_config
    run_config_tests
    generate_config_summary
    
    log "🎉 Configuración completa finalizada!"
    log ""
    log "📋 Próximos pasos:"
    log "1. Revisar config-summary.md para detalles de la configuración"
    log "2. Configurar credenciales de Google OAuth si es necesario"
    log "3. Compilar la aplicación mobile"
    log "4. Iniciar el backend y probar la aplicación"
    log ""
    log "🔧 Para compilar la app mobile:"
    log "   cd mobile && eas build -p android --profile preview"
    log ""
    log "🚀 Para iniciar el backend:"
    log "   cd backend && npm run start:dev"
}

# Ejecutar función principal
main "$@"