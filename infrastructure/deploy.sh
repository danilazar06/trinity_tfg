#!/bin/bash

# Script de despliegue para Trinity MVP
echo "🚀 Iniciando despliegue de Trinity MVP..."

# Verificar que estamos en el directorio correcto
if [ ! -f "package.json" ]; then
    echo "❌ Error: Ejecuta este script desde el directorio infrastructure/"
    exit 1
fi

# Verificar AWS CLI
if ! command -v aws &> /dev/null; then
    echo "❌ Error: AWS CLI no está instalado"
    exit 1
fi

# Verificar credenciales AWS
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ Error: Credenciales AWS no configuradas"
    echo "Ejecuta: aws configure"
    exit 1
fi

# Configurar variables de entorno
echo "🔧 Configurando variables de entorno..."
export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export CDK_DEFAULT_REGION=${AWS_DEFAULT_REGION:-us-east-1}

echo "📋 Configuración:"
echo "  - Account: $CDK_DEFAULT_ACCOUNT"
echo "  - Region: $CDK_DEFAULT_REGION"

# Verificar variables requeridas
if [ -z "$TMDB_API_KEY" ]; then
    echo "⚠️  Advertencia: TMDB_API_KEY no configurada"
    echo "   Configúrala con: export TMDB_API_KEY=tu-api-key"
fi

if [ -z "$HF_API_TOKEN" ]; then
    echo "⚠️  Advertencia: HF_API_TOKEN no configurada"
    echo "   Configúrala con: export HF_API_TOKEN=tu-token"
fi

# Instalar dependencias
echo "📦 Instalando dependencias..."
npm install

# Compilar TypeScript
echo "🔨 Compilando proyecto..."
npm run build

# Bootstrap CDK (solo si es necesario)
echo "🏗️  Verificando bootstrap de CDK..."
if ! aws cloudformation describe-stacks --stack-name CDKToolkit --region $CDK_DEFAULT_REGION &> /dev/null; then
    echo "🏗️  Ejecutando bootstrap de CDK..."
    npx cdk bootstrap
else
    echo "✅ CDK ya está bootstrapped"
fi

# Sintetizar stack
echo "🔍 Sintetizando stack..."
npx cdk synth

# Desplegar
echo "🚀 Desplegando infraestructura..."
npx cdk deploy --all --require-approval never

echo "✅ ¡Despliegue completado!"
echo ""
echo "📋 Próximos pasos:"
echo "1. Copia los outputs del CDK a tu archivo .env del backend"
echo "2. Configura las variables COGNITO_USER_POOL_ID y COGNITO_CLIENT_ID"
echo "3. Ejecuta el backend: cd ../backend && npm run start:dev"