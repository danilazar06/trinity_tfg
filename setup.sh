#!/bin/bash

# ========================================
# TRINITY MVP - SCRIPT DE INSTALACIÓN
# ========================================

set -e  # Salir si hay algún error

echo "🚀 Iniciando configuración de Trinity MVP..."
echo ""

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Función para imprimir mensajes con color
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Verificar que Node.js está instalado
print_status "Verificando Node.js..."
if ! command -v node &> /dev/null; then
    print_error "Node.js no está instalado. Por favor instala Node.js 18+ desde https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    print_error "Se requiere Node.js 18 o superior. Versión actual: $(node --version)"
    exit 1
fi
print_success "Node.js $(node --version) ✓"

# Verificar que npm está instalado
print_status "Verificando npm..."
if ! command -v npm &> /dev/null; then
    print_error "npm no está instalado"
    exit 1
fi
print_success "npm $(npm --version) ✓"

# Verificar que AWS CLI está instalado
print_status "Verificando AWS CLI..."
if ! command -v aws &> /dev/null; then
    print_warning "AWS CLI no está instalado. Instálalo desde https://aws.amazon.com/cli/"
    print_warning "Continuando sin AWS CLI..."
else
    print_success "AWS CLI $(aws --version | cut -d' ' -f1 | cut -d'/' -f2) ✓"
fi

# Configurar archivo .env
print_status "Configurando archivo de entorno..."
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        print_success "Archivo .env creado desde .env.example"
        print_warning "⚠️  IMPORTANTE: Edita el archivo .env con tus credenciales reales"
    else
        print_error "No se encontró .env.example"
        exit 1
    fi
else
    print_success "Archivo .env ya existe"
fi

# Instalar dependencias del backend
print_status "Instalando dependencias del backend..."
cd backend
npm install
print_success "Dependencias del backend instaladas ✓"
cd ..

# Instalar dependencias de infrastructure
print_status "Instalando dependencias de infrastructure..."
cd infrastructure
npm install
print_success "Dependencias de infrastructure instaladas ✓"
cd ..

# Instalar dependencias del mobile (si existe)
if [ -d "mobile" ]; then
    print_status "Instalando dependencias del mobile..."
    cd mobile
    if [ -f "package.json" ]; then
        npm install
        print_success "Dependencias del mobile instaladas ✓"
    else
        print_warning "No se encontró package.json en mobile/"
    fi
    cd ..
fi

# Verificar archivo .env
print_status "Verificando configuración..."
if [ -f ".env" ]; then
    # Verificar que las variables críticas no tengan valores por defecto
    if grep -q "your-" .env; then
        print_warning "⚠️  Hay variables en .env que necesitan configuración:"
        grep "your-" .env | head -5
        echo ""
        print_warning "Por favor, actualiza estas variables con tus credenciales reales"
    fi
    
    # Verificar variables críticas
    source .env
    if [ -z "$TMDB_API_KEY" ] || [ "$TMDB_API_KEY" = "your-tmdb-api-key" ]; then
        print_warning "⚠️  TMDB_API_KEY no configurada"
    fi
    
    if [ -z "$HF_API_TOKEN" ] || [ "$HF_API_TOKEN" = "hf_your-hugging-face-token" ]; then
        print_warning "⚠️  HF_API_TOKEN no configurada"
    fi
fi

echo ""
echo "🎉 ¡Instalación completada!"
echo ""
echo "📋 Próximos pasos:"
echo "1. Edita el archivo .env con tus credenciales reales:"
echo "   - TMDB_API_KEY: Obtén en https://www.themoviedb.org/settings/api"
echo "   - HF_API_TOKEN: Obtén en https://huggingface.co/settings/tokens"
echo "   - AWS credentials: Configura con 'aws configure'"
echo ""
echo "2. Para desplegar la infraestructura:"
echo "   cd infrastructure && ./deploy.sh"
echo ""
echo "3. Para ejecutar el backend:"
echo "   cd backend && npm run start:dev"
echo ""
echo "4. Para ejecutar tests:"
echo "   cd backend && npm test"
echo ""
print_success "¡Trinity MVP está listo para usar! 🚀"