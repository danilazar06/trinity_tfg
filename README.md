# 🚀 Trinity TFG - Monorepo

Bienvenido al repositorio oficial del TFG. Este proyecto es un **Monorepo** que contiene tanto el Backend (NestJS) como la Aplicación Móvil (React Native).

## 📂 Estructura del Proyecto

trinity_tfg/
├── backend/            # API REST con NestJS
├── mobile/             # App nativa con React Native
├── .github/workflows/  # Automatización CI/CD (Los "Robots")
└── README.md           # Estás leyendo esto

---

## 🛠️ Configuración Inicial (Onboarding)

Si acabas de llegar, sigue estos pasos estrictamente para levantar el entorno:

### 1. Clonar y preparar
git clone https://github.com/danilazar06/trinity_tfg.git
cd trinity_tfg

### 2. Instalar dependencias (Doble instalación)
Como es un monorepo, debes instalar las librerías en ambas carpetas:

**Terminal 1 (Backend):**
cd backend
npm install
cp .env.template .env  # ¡IMPORTANTE! Pide las claves al equipo

**Terminal 2 (Mobile):**
cd mobile
npm install
# Si estás en Mac: cd ios && pod install && cd ..

### 3. Arrancar el proyecto
* **Backend:** npm run start:dev (en la carpeta backend).
* **Mobile:** npm run start (en la carpeta mobile).

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