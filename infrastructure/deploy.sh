#!/bin/bash

# ========================================
# TRINITY MVP - SCRIPT DE DESPLIEGUE
# ========================================

set -e  # Salir si hay algún error

# Cargar variables de entorno desde .env
if [ -f "../.env" ]; then
    echo "📋 Cargando variables de entorno desde .env..."
    export $(grep -v '^#' ../.env | xargs)
elif [ -f ".env" ]; then
    echo "📋 Cargando variables de entorno desde .env..."
    export $(grep -v '^#' .env | xargs)
else
    echo "⚠️  Archivo .env no encontrado. Creando desde .env.example..."
    if [ -f "../.env.example" ]; then
        cp ../.env.example ../.env
        echo "✅ Archivo .env creado. Por favor, edítalo con tus credenciales reales y ejecuta el script nuevamente."
        exit 1
    else
        echo "❌ No se encontró .env.example"
        exit 1
    fi
fi

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
account=$(aws sts get-caller-identity --query Account --output text)
export CDK_DEFAULT_ACCOUNT=${CDK_DEFAULT_ACCOUNT:-$account}
export CDK_DEFAULT_REGION=${CDK_DEFAULT_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}

echo "📋 Configuración:"
echo "  - Account: $CDK_DEFAULT_ACCOUNT"
echo "  - Region: $CDK_DEFAULT_REGION"

# Verificar variables requeridas
if [ -z "$TMDB_API_KEY" ] || [ "$TMDB_API_KEY" = "your-tmdb-api-key" ]; then
    echo "⚠️  Advertencia: TMDB_API_KEY no configurada correctamente en .env"
    echo "   Obtén tu API key en: https://www.themoviedb.org/settings/api"
fi

if [ -z "$HF_API_TOKEN" ] || [ "$HF_API_TOKEN" = "hf_your-hugging-face-token" ]; then
    echo "⚠️  Advertencia: HF_API_TOKEN no configurada correctamente en .env"
    echo "   Obtén tu token en: https://huggingface.co/settings/tokens"
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
echo "2. Configura las variables COGNITO_USER_POOL_ID y COGNITO_CLIENT_ID en .env"
echo "3. Ejecuta el backend: cd ../backend && npm run start:dev"