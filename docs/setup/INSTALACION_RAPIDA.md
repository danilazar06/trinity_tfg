# 🚀 Guía de Instalación Rápida - Trinity MVP

## ⚡ Instalación en 5 Minutos

### Opción 1: Script Automático (Recomendado)

**Linux/macOS:**
```bash
git clone https://github.com/danilazar06/trinity_tfg.git
cd trinity_tfg
./setup.sh
```

**Windows (PowerShell):**
```powershell
git clone https://github.com/danilazar06/trinity_tfg.git
cd trinity_tfg
.\setup.ps1
```

### Opción 2: Instalación Manual

1. **Clonar el repositorio:**
```bash
git clone https://github.com/danilazar06/trinity_tfg.git
cd trinity_tfg
```

2. **Configurar variables de entorno:**
```bash
# Copiar el archivo de ejemplo
cp .env.example .env

# Editar .env con tus credenciales reales
# Ver: docs/setup/VARIABLES_ENTORNO.md para detalles
```

3. **Instalar dependencias:**
```bash
# Backend
cd backend && npm install && cd ..

# Infrastructure
cd infrastructure && npm install && cd ..

# Mobile (opcional)
cd mobile && npm install && cd ..
```

## 🔑 Credenciales Mínimas Requeridas

Para que Trinity funcione necesitas estas credenciales:

```bash
# TMDB API Key - https://www.themoviedb.org/settings/api
TMDB_API_KEY=tu-tmdb-api-key

# Hugging Face Token - https://huggingface.co/settings/tokens
HF_API_TOKEN=hf_tu-hugging-face-token

# AWS Credentials - aws configure
AWS_ACCESS_KEY_ID=tu-aws-access-key
AWS_SECRET_ACCESS_KEY=tu-aws-secret-key
```

## 🚀 Comandos de Desarrollo

### Ejecutar Backend
```bash
cd backend
npm run start:dev
```

### Ejecutar Mobile
```bash
cd mobile
npm start
```

### Ejecutar Tests
```bash
cd backend
npm test
```

## ✅ Verificación Rápida

1. **Backend funcionando**: http://localhost:3000/health
2. **Mobile funcionando**: Escanear QR code con Expo Go
3. **Tests pasando**: Todos los tests en verde

## 🆘 Problemas Comunes

### Error: "Variables de entorno no configuradas"
```bash
# Verificar que .env existe
ls -la .env

# Si no existe, copiarlo
cp .env.example .env
```

### Error: "AWS CLI no configurado"
```bash
# Instalar AWS CLI y configurar
aws configure
```

### Error: "Node.js versión incorrecta"
```bash
# Verificar versión (necesitas Node.js 18+)
node --version
```

## 📚 Documentación Adicional

- **Configuración Completa**: [CONFIGURACION_COMPLETA.md](./CONFIGURACION_COMPLETA.md)
- **Setup AWS**: [AWS_SETUP.md](./AWS_SETUP.md)
- **Variables de Entorno**: [VARIABLES_ENTORNO.md](./VARIABLES_ENTORNO.md)
- **Estado del Proyecto**: [../ESTADO_ACTUAL.md](../ESTADO_ACTUAL.md)

---

**¿Necesitas ayuda?** Consulta la documentación completa o pregunta en el equipo.