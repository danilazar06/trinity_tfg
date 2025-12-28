# 🔧 Guía de Variables de Entorno - Trinity MVP

## 📋 Variables Requeridas

### AWS Configuration
```bash
# ========================================
# AWS CONFIGURATION
# ========================================
CDK_DEFAULT_ACCOUNT=tu-aws-account-id
CDK_DEFAULT_REGION=eu-west-1
AWS_ACCESS_KEY_ID=tu-aws-access-key
AWS_SECRET_ACCESS_KEY=tu-aws-secret-key
```

### External API Keys
```bash
# ========================================
# EXTERNAL API KEYS
# ========================================
# TMDB API Key - Obtener en: https://www.themoviedb.org/settings/api
TMDB_API_KEY=tu-tmdb-api-key

# Hugging Face Token - Obtener en: https://huggingface.co/settings/tokens
HF_API_TOKEN=hf_tu-hugging-face-token
```

### AWS Cognito (Se generan automáticamente)
```bash
# ========================================
# AWS COGNITO (Se generan automáticamente)
# ========================================
COGNITO_USER_POOL_ID=se-genera-automaticamente
COGNITO_CLIENT_ID=se-genera-automaticamente
```

### Google OAuth (Opcional)
```bash
# ========================================
# GOOGLE OAUTH (Opcional)
# ========================================
GOOGLE_CLIENT_ID=tu-google-client-id
GOOGLE_CLIENT_SECRET=tu-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
```

## 🔑 Cómo Obtener Cada Credencial

### 1. TMDB API Key
1. Regístrate en [The Movie Database](https://www.themoviedb.org/)
2. Ve a [Settings > API](https://www.themoviedb.org/settings/api)
3. Solicita una API Key
4. Copia la API Key a `TMDB_API_KEY`

### 2. Hugging Face Token
1. Regístrate en [Hugging Face](https://huggingface.co/)
2. Ve a [Settings > Access Tokens](https://huggingface.co/settings/tokens)
3. Crea un nuevo token con permisos de lectura
4. Copia el token a `HF_API_TOKEN`

### 3. AWS Credentials
1. Instala [AWS CLI](https://aws.amazon.com/cli/)
2. Ejecuta `aws configure`
3. Introduce tus credenciales de AWS
4. Copia las credenciales a las variables correspondientes

### 4. Google OAuth (Opcional)
Ver guía completa: [../auth/GOOGLE_OAUTH.md](../auth/GOOGLE_OAUTH.md)

## 📁 Archivos de Configuración

### Archivo Principal (.env)
```bash
# Ubicación: trinity_tfg/.env
# ⚠️ NUNCA subir este archivo a Git
# ✅ Contiene todas las credenciales reales
```

### Plantilla (.env.example)
```bash
# Ubicación: trinity_tfg/.env.example
# ✅ Plantilla pública sin credenciales reales
# ✅ Subido a Git como referencia
```

### Mobile (app.config.js)
```javascript
export default {
  expo: {
    extra: {
      googleWebClientId: process.env.GOOGLE_CLIENT_ID,
      // Otras configuraciones...
    },
  },
};
```

## 🔐 Seguridad

### ✅ Buenas Prácticas
- Archivo `.env` está en `.gitignore`
- Variables de entorno centralizadas
- Plantilla `.env.example` para desarrolladores
- Nunca hardcodear credenciales en el código

### ⚠️ Nunca Hacer
- Subir `.env` a Git
- Hardcodear credenciales en el código
- Compartir credenciales por chat/email
- Usar credenciales de producción en desarrollo

## 🛠️ Comandos Útiles

### Verificar Variables
```bash
# Verificar que .env existe
ls -la .env

# Verificar contenido (sin mostrar valores)
grep -E "^[A-Z_]+" .env | cut -d'=' -f1
```

### Cargar Variables
```bash
# En scripts de bash
source .env

# En Node.js
require('dotenv').config()
```

### Validar Configuración
```bash
# Verificar conectividad AWS
npm run aws:check

# Verificar health del backend
curl http://localhost:3000/health
```

## 🆘 Solución de Problemas

### Error: "Cannot load environment variables"
```bash
# Verificar que .env existe
ls -la .env

# Si no existe, crear desde plantilla
cp .env.example .env
```

### Error: "Invalid AWS credentials"
```bash
# Verificar configuración AWS
aws sts get-caller-identity

# Reconfigurar si es necesario
aws configure
```

### Error: "TMDB API key invalid"
```bash
# Verificar API key
curl "https://api.themoviedb.org/3/configuration?api_key=TU_API_KEY"
```

## 📚 Referencias

- **AWS CLI Setup**: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html
- **TMDB API Docs**: https://developers.themoviedb.org/3
- **Hugging Face Tokens**: https://huggingface.co/docs/hub/security-tokens
- **Google OAuth Setup**: [../auth/GOOGLE_OAUTH.md](../auth/GOOGLE_OAUTH.md)

---

**Última actualización**: 29 de diciembre de 2025