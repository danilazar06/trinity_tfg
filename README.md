# 🚀 Trinity MVP - Aplicación de Consenso Multimedia

Aplicación para consensuar contenido multimedia en grupo con IA integrada.

## 🚀 Instalación Rápida

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
# Necesitarás:
# - TMDB_API_KEY: https://www.themoviedb.org/settings/api
# - HF_API_TOKEN: https://huggingface.co/settings/tokens
# - AWS credentials: aws configure
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

## 🔑 Configuración de Credenciales

### Variables de Entorno Requeridas

Edita el archivo `.env` en la raíz del proyecto con estas credenciales:

```bash
# ========================================
# AWS CONFIGURATION
# ========================================
CDK_DEFAULT_ACCOUNT=tu-aws-account-id
CDK_DEFAULT_REGION=eu-west-1
AWS_ACCESS_KEY_ID=tu-aws-access-key
AWS_SECRET_ACCESS_KEY=tu-aws-secret-key

# ========================================
# EXTERNAL API KEYS
# ========================================
# TMDB API Key - Obtener en: https://www.themoviedb.org/settings/api
TMDB_API_KEY=tu-tmdb-api-key

# Hugging Face Token - Obtener en: https://huggingface.co/settings/tokens
HF_API_TOKEN=hf_tu-hugging-face-token

# ========================================
# AWS COGNITO (Se generan automáticamente)
# ========================================
COGNITO_USER_POOL_ID=se-genera-automaticamente
COGNITO_CLIENT_ID=se-genera-automaticamente
```

### Obtener Credenciales

1. **TMDB API Key:**
   - Regístrate en [The Movie Database](https://www.themoviedb.org/)
   - Ve a [Settings > API](https://www.themoviedb.org/settings/api)
   - Solicita una API Key

2. **Hugging Face Token:**
   - Regístrate en [Hugging Face](https://huggingface.co/)
   - Ve a [Settings > Access Tokens](https://huggingface.co/settings/tokens)
   - Crea un nuevo token

3. **AWS Credentials:**
   - Instala [AWS CLI](https://aws.amazon.com/cli/)
   - Ejecuta `aws configure`
   - Introduce tus credenciales de AWS

## 📂 Estructura del Proyecto

```
trinity_tfg/
├── .env                    # ⚠️ Credenciales (NO subir a Git)
├── .env.example           # Plantilla de variables de entorno
├── setup.sh              # Script de instalación (Linux/macOS)
├── setup.ps1             # Script de instalación (Windows)
├── backend/               # API REST con NestJS
├── infrastructure/        # Infraestructura AWS CDK
├── mobile/               # App React Native
└── README.md             # Este archivo
```

## 🚀 Comandos de Desarrollo

### Desplegar Infraestructura

**Linux/macOS:**
```bash
cd infrastructure
./deploy.sh
```

**Windows:**
```powershell
cd infrastructure
.\deploy.ps1
```

### Ejecutar Backend
```bash
cd backend
npm run start:dev
```

### Ejecutar Tests
```bash
cd backend
npm test
```

### Ejecutar Mobile
```bash
cd mobile
npm start
```

## 🔐 Seguridad

- ✅ **Archivo `.env` está en `.gitignore`** - Las credenciales NO se suben a Git
- ✅ **Variables de entorno centralizadas** - Todas las credenciales en un solo lugar
- ✅ **Plantilla `.env.example`** - Los desarrolladores saben qué variables necesitan
- ⚠️ **NUNCA subas credenciales reales** - Usa siempre el archivo `.env`

## 🛠️ Configuración Inicial (Onboarding)

Si acabas de llegar, sigue estos pasos estrictamente para levantar el entorno:

### 1. Clonar y preparar
```bash
git clone https://github.com/danilazar06/trinity_tfg.git
cd trinity_tfg
```

### 2. Ejecutar script de instalación
```bash
# Linux/macOS
./setup.sh

# Windows PowerShell
.\setup.ps1
```

### 3. Configurar credenciales
Edita el archivo `.env` con tus credenciales reales (ver sección "Configuración de Credenciales")

### 4. Desplegar infraestructura
```bash
cd infrastructure
./deploy.sh  # Linux/macOS
# o
.\deploy.ps1  # Windows
```

### 5. Arrancar el proyecto
```bash
# Backend
cd backend
npm run start:dev

# Mobile (en otra terminal)
cd mobile
npm start
```

---

## 🌊 Flujo de Trabajo (Git Flow)

⚠️ **REGLA DE ORO:** La rama main está **BLOQUEADA**. No se puede hacer push directo. Todo cambio debe pasar por Pull Request.

### Paso 1: Antes de empezar a trabajar
Siempre actualiza tu local para evitar conflictos:
git checkout main
git pull origin main

### Paso 2: Crear una rama (Feature Branch)
Crea una rama específica para lo que vayas a hacer. Usa estos prefijos:
* feat/ -> Para nuevas funcionalidades (ej: feat/login-screen).
* fix/ -> Para arreglar errores (ej: fix/boton-roto).
* chore/ -> Mantenimiento o config (ej: chore/actualizar-readme).

git checkout -b feat/nombre-de-la-tarea

### Paso 3: Guardar cambios (Commits)
Usamos **Conventional Commits** para mantener el historial limpio.
Estructura: tipo: descripción breve.

Ejemplos:
* ✅ git commit -m "feat: añadir endpoint de usuarios"
* ✅ git commit -m "fix: corregir color del navbar"
* ❌ git commit -m "cambios" (Prohibido)

### Paso 4: Subir cambios
Sube tu rama a GitHub:
git push origin feat/nombre-de-la-tarea

---

## 🤝 Pull Requests (PR) y Revisión

Una vez subida tu rama:

1.  Ve a GitHub y verás un botón amarillo "Compare & pull request".
2.  Escribe una descripción de lo que has hecho.
3.  **Asigna a un compañero** como "Reviewer".
4.  Espera a los **Checks Automáticos** (GitHub Actions):
    * 🤖 **Backend CI:** Si tocaste el back, comprobará que compila.
    * 🤖 **Mobile CI:** Si tocaste el móvil, comprobará linting y tests.
    * 🔴 **Si sale rojo:** Tienes que arreglarlo en tu local y volver a hacer push.
    * 🟢 **Si sale verde:** Tu código es seguro.
5.  Una vez aprobado por un compañero y con el check verde, dale a **"Squash and Merge"**.

---

## 🤖 CI/CD (Automatización)

Tenemos configurados flujos de trabajo en .github/workflows:

* **Backend CI:** Se activa al tocar la carpeta backend/. Ejecuta npm run build y npm run test.
* **Mobile CI:** Se activa al tocar la carpeta mobile/. Ejecuta npm run lint y npm run test.

**Nota:** Si rompes el build, el PR se bloqueará automáticamente. ¡No subas código roto!

---

## 🔐 Seguridad y Secretos

* **NUNCA** subas credenciales, claves de AWS o contraseñas al repositorio.
* Usa siempre archivos .env.
* Si necesitas una clave nueva, añádela al .env.template (sin el valor real) y avisa al equipo por el grupo.

---

### ¿Dudas?
Pregúntale a **Kiro** (nuestra IA Tech Lead) o pon un mensaje en el grupo. ¡A picar código! 🚀

---

## 🌊 Flujo de Trabajo (Git Flow)

⚠️ **REGLA DE ORO:** La rama main está **BLOQUEADA**. No se puede hacer push directo. Todo cambio debe pasar por Pull Request.

### Paso 1: Antes de empezar a trabajar
Siempre actualiza tu local para evitar conflictos:
```bash
git checkout main
git pull origin main
```

### Paso 2: Crear una rama (Feature Branch)
Crea una rama específica para lo que vayas a hacer. Usa estos prefijos:
* `feat/` -> Para nuevas funcionalidades (ej: `feat/login-screen`)
* `fix/` -> Para arreglar errores (ej: `fix/boton-roto`)
* `chore/` -> Mantenimiento o config (ej: `chore/actualizar-readme`)

```bash
git checkout -b feat/nombre-de-la-tarea
```

### Paso 3: Guardar cambios (Commits)
Usamos **Conventional Commits** para mantener el historial limpio.
Estructura: `tipo: descripción breve`

Ejemplos:
* ✅ `git commit -m "feat: añadir endpoint de usuarios"`
* ✅ `git commit -m "fix: corregir color del navbar"`
* ❌ `git commit -m "cambios"` (Prohibido)

### Paso 4: Subir cambios
```bash
git push origin feat/nombre-de-la-tarea
```

---

## 🤝 Pull Requests (PR) y Revisión

Una vez subida tu rama:

1. Ve a GitHub y verás un botón amarillo "Compare & pull request"
2. Escribe una descripción de lo que has hecho
3. **Asigna a un compañero** como "Reviewer"
4. Espera a los **Checks Automáticos** (GitHub Actions):
   * 🤖 **Backend CI:** Si tocaste el back, comprobará que compila
   * 🤖 **Mobile CI:** Si tocaste el móvil, comprobará linting y tests
   * 🔴 **Si sale rojo:** Tienes que arreglarlo en tu local y volver a hacer push
   * 🟢 **Si sale verde:** Tu código es seguro
5. Una vez aprobado por un compañero y con el check verde, dale a **"Squash and Merge"**

---

## 🤖 CI/CD (Automatización)

Tenemos configurados flujos de trabajo en `.github/workflows`:

* **Backend CI:** Se activa al tocar la carpeta `backend/`. Ejecuta `npm run build` y `npm run test`
* **Mobile CI:** Se activa al tocar la carpeta `mobile/`. Ejecuta `npm run lint` y `npm run test`

**Nota:** Si rompes el build, el PR se bloqueará automáticamente. ¡No subas código roto!

---

## 🔐 Seguridad y Secretos

* **NUNCA** subas credenciales, claves de AWS o contraseñas al repositorio
* Usa siempre archivos `.env`
* Si necesitas una clave nueva, añádela al `.env.example` (sin el valor real) y avisa al equipo por el grupo

---

## 🆘 Solución de Problemas

### Error: "Variables de entorno no configuradas"
```bash
# Verifica que el archivo .env existe
ls -la .env

# Si no existe, cópialo desde el ejemplo
cp .env.example .env

# Edita con tus credenciales reales
```

### Error: "AWS CLI no configurado"
```bash
# Instala AWS CLI
# Linux/macOS: https://aws.amazon.com/cli/
# Windows: https://aws.amazon.com/cli/

# Configura credenciales
aws configure
```

### Error: "Node.js versión incorrecta"
```bash
# Verifica versión (necesitas Node.js 18+)
node --version

# Si es menor a 18, actualiza desde https://nodejs.org/
```

---

### ¿Dudas?
Pregúntale a **Kiro** (nuestra IA Tech Lead) o pon un mensaje en el grupo. ¡A picar código! 🚀