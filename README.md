# Trinity - Plataforma de Votación de Películas

## 🎬 Descripción

Trinity es una **aplicación móvil para votar películas en grupo**, construida con tecnologías modernas y diseñada para que grupos de amigos puedan decidir qué película ver de manera divertida y democrática.

### ✨ Características Principales

- 🔐 **Autenticación Completa**: Email/Password + Google Sign-In
- 🎬 **Votación de Películas**: Sistema de votación intuitivo y rápido
- 📱 **App Móvil Nativa**: React Native con Expo para iOS y Android
- 🌐 **También Web**: Funciona perfectamente en navegadores
- ⚡ **Tiempo Real**: Actualizaciones instantáneas de votaciones
- 🛡️ **Seguro**: Backend robusto con AWS y autenticación federada
- 🎨 **Diseño Moderno**: Interfaz elegante con animaciones fluidas

## 🏗️ Arquitectura

### Stack Tecnológico

#### Frontend Móvil ✅
- **Framework**: React Native + Expo
- **Navegación**: Expo Router
- **UI**: Componentes custom + Linear Gradients
- **Autenticación**: Google Sign-In + JWT
- **Estado**: React Context + Hooks

#### Backend ✅
- **Framework**: NestJS (Node.js/TypeScript)
- **Base de Datos**: AWS DynamoDB
- **Autenticación**: AWS Cognito + Google OAuth
- **Real-time**: AWS AppSync + GraphQL
- **Seguridad**: JWT, Rate Limiting, Validaciones

## 📁 Estructura del Proyecto

```
trinity/
├── mobile/                    # 📱 Aplicación React Native
│   ├── app/                   # Pantallas principales
│   │   ├── login.tsx         # ✅ Login con email/Google
│   │   ├── register.tsx      # ✅ Registro de usuarios
│   │   ├── (tabs)/           # ✅ Navegación principal
│   │   └── test-connection.tsx # ✅ Test de conectividad
│   ├── src/
│   │   ├── components/       # Componentes reutilizables
│   │   ├── context/          # ✅ AuthContext completo
│   │   ├── services/         # ✅ API clients y servicios
│   │   ├── types/            # ✅ Tipos TypeScript
│   │   └── utils/            # ✅ Utilidades y tema
│   └── app.json             # ✅ Configuración Expo
├── backend/                   # 🎯 API REST/GraphQL (NestJS)
│   ├── src/
│   │   ├── modules/          # Módulos de negocio
│   │   │   ├── auth/        # 🔐 Autenticación completa
│   │   │   ├── voting/      # 🗳️ Sistema de votación
│   │   │   └── campaigns/   # 📋 Gestión de campañas
│   │   ├── infrastructure/  # 🏗️ Servicios AWS
│   │   ├── security/        # 🛡️ Seguridad
│   │   └── monitoring/      # 📈 Monitoreo
│   └── tests/               # 🧪 Tests completos
└── .kiro/                    # 📋 Especificaciones de desarrollo
    └── specs/               # Specs de funcionalidades
```

## 🚀 Inicio Rápido

### Prerrequisitos
- Node.js 18+
- Expo CLI: `npm install -g @expo/cli`
- Dispositivo móvil con Expo Go (opcional)

### 1. Configuración Inicial
```bash
# Clonar repositorio
git clone <repository-url>
cd trinity

# Configurar backend
cd backend
npm install
cp .env.example .env
# Editar .env con tus configuraciones AWS

# Configurar móvil
cd ../mobile
npm install
```

### 2. Iniciar Backend
```bash
cd backend
npm run start:dev
```
Backend disponible en `http://localhost:3002`

### 3. Iniciar App Móvil
```bash
cd mobile
npm start
```

### 4. Usar la Aplicación

#### **Opción A: En el Navegador Web**
- Presiona `w` en la terminal de Expo
- Se abrirá en `http://localhost:8081`

#### **Opción B: En tu Móvil**
- Instala **Expo Go** desde tu app store
- Escanea el QR code de la terminal
- La app se abrirá automáticamente

#### **Opción C: En Simulador**
- **Android**: Presiona `a` en la terminal
- **iOS**: Presiona `i` (requiere macOS + Xcode)

## 📱 Funcionalidades Implementadas

### ✅ Autenticación Completa
- **Login con Email/Password**: Registro e inicio de sesión tradicional
- **Google Sign-In**: Autenticación con cuenta de Google
- **Gestión de Sesiones**: Tokens JWT con refresh automático
- **Detección de Entorno**: Funciona en Expo Go, Development Build y Web

### ✅ Interfaz de Usuario
- **Diseño Moderno**: Tema oscuro con gradientes y animaciones
- **Navegación Fluida**: Expo Router con transiciones suaves
- **Validación en Tiempo Real**: Formularios con feedback inmediato
- **Manejo de Errores**: Alertas informativas y recuperación automática
- **Estados de Carga**: Feedback visual durante operaciones

### ✅ Conectividad Backend
- **API Client Robusto**: Manejo automático de tokens y errores
- **Test de Conectividad**: Pantalla para verificar conexión con backend
- **Retry Automático**: Reintento en caso de errores de red
- **Interceptores**: Manejo automático de 401/403 y refresh de tokens

### ✅ Google Sign-In Inteligente
- **Detección Automática**: Detecta si Google Sign-In está disponible
- **Fallback Graceful**: Funciona sin Google Sign-In cuando no está disponible
- **Mensajes Informativos**: Explica al usuario qué esperar en cada entorno
- **Configuración Flexible**: Funciona en desarrollo y producción

## 🔧 Configuración de Google Sign-In

### Para Desarrollo Rápido
La app ya está configurada con credenciales de desarrollo. Solo necesitas:

1. **Probar en Web**: `npm start` → presiona `w`
2. **Probar en Expo Go**: `npm start` → escanea QR
3. **Ver Estado**: Usa la pantalla "Test de Conexión"

### Para Producción
Si quieres configurar tus propias credenciales de Google:

1. **Crear Proyecto Firebase**:
   - Ve a [Firebase Console](https://console.firebase.google.com/)
   - Crea un nuevo proyecto
   - Habilita Google Sign-In en Authentication

2. **Configurar Apps**:
   - **Android**: Package name `com.trinity.app`
   - **iOS**: Bundle ID `com.trinity.app`
   - **Web**: Configura dominio autorizado

3. **Descargar Archivos**:
   - `google-services.json` para Android
   - `GoogleService-Info.plist` para iOS
   - Colócalos en la carpeta `mobile/`

4. **Actualizar Configuración**:
   ```json
   // mobile/app.json
   {
     "expo": {
       "extra": {
         "googleWebClientId": "TU_WEB_CLIENT_ID.apps.googleusercontent.com"
       }
     }
   }
   ```

## 🧪 Testing y Debugging

### Test de Conectividad
La app incluye una pantalla de "Test de Conexión" que verifica:
- ✅ Detección del entorno de ejecución
- ✅ Disponibilidad de Google Sign-In
- ✅ Conectividad con el backend
- ✅ Estado de los endpoints de autenticación

### Debugging
```bash
# Ver logs del backend
cd backend && npm run start:dev

# Ver logs de la app móvil
cd mobile && npm start
# Los logs aparecen en la terminal de Expo

# Test manual de conectividad
node mobile/test-google-signin.js
```

### Problemas Comunes

#### "Backend no responde"
```bash
# Verificar que el backend esté corriendo
curl http://localhost:3002/api/health

# Verificar IP en el cliente móvil
# Editar mobile/src/services/apiClient.ts si es necesario
```

#### "Google Sign-In no funciona"
- **En Expo Go**: Normal, usa email/password o prueba en web
- **En Development Build**: Verifica configuración de Google Services
- **En Web**: Debería funcionar con credenciales web

#### "App no carga"
```bash
# Limpiar cache
cd mobile
npx expo start --clear

# Reinstalar dependencias
rm -rf node_modules && npm install
```

## 📡 API Endpoints

### Autenticación
```
POST /api/auth/register          # Registro con email
POST /api/auth/login             # Login con email
POST /api/auth/google/login      # Login con Google
GET  /api/auth/profile           # Perfil del usuario
POST /api/auth/refresh           # Refresh token
```

### Sistema
```
GET  /api/health                 # Health check
GET  /api/auth/google/available  # Disponibilidad Google Auth
```

### Votación (Próximamente)
```
GET    /api/campaigns            # Listar campañas
POST   /api/campaigns            # Crear campaña
POST   /api/campaigns/:id/vote   # Votar
GET    /api/campaigns/:id/results # Resultados
```

## 🎯 Próximas Funcionalidades

### Funcionalidades de Votación de Películas
- [ ] **Salas de Votación**: Crear y unirse a salas
- [ ] **Catálogo de Películas**: Integración con TMDB API
- [ ] **Swipe de Películas**: Interfaz tipo Tinder
- [ ] **Sistema de Matches**: Ver películas que todos eligieron
- [ ] **Resultados en Tiempo Real**: Ver votos en vivo

### Mejoras de UX
- [ ] **Perfil de Usuario**: Editar información y preferencias
- [ ] **Historial**: Ver votaciones pasadas
- [ ] **Notificaciones**: Alertas de nuevas votaciones
- [ ] **Temas**: Personalización de la interfaz

### Funcionalidades Avanzadas
- [ ] **Recomendaciones IA**: Sugerencias personalizadas
- [ ] **Integración Social**: Compartir en redes sociales
- [ ] **Estadísticas**: Analytics de preferencias
- [ ] **Gamificación**: Sistema de logros y badges

## 🚀 Despliegue

### Frontend Móvil
```bash
# Development Build (recomendado para testing)
cd mobile
npx eas build --platform all

# Publicar en stores
npx eas submit --platform all
```

### Backend
```bash
# Docker
cd backend
docker build -t trinity-backend .
docker run -p 3002:3002 trinity-backend

# AWS Lambda (Serverless)
npm install -g serverless
serverless deploy --stage production
```

## 📊 Estado del Proyecto

### ✅ Completado (100% Funcional)
- 🔐 **Sistema de Autenticación**: Email + Google Sign-In
- 📱 **App Móvil Base**: Navegación, UI, conectividad
- 🎯 **Backend Robusto**: API REST completa con seguridad
- 🧪 **Testing**: Tests automatizados y herramientas de debug
- 📖 **Documentación**: Guías completas de setup y uso

### 🔄 En Desarrollo
- 🎬 **Funcionalidades de Votación**: Salas, películas, matches
- 🎨 **Mejoras de UI**: Animaciones, temas, personalización
- 📈 **Analytics**: Métricas de uso y preferencias

### 📋 Roadmap
- **Q1 2025**: Funcionalidades core de votación
- **Q2 2025**: Funcionalidades sociales y gamificación
- **Q3 2025**: IA y recomendaciones personalizadas
- **Q4 2025**: Expansión a web y desktop

## 📞 Soporte

### Recursos
- 🐛 **Issues**: Reportar bugs en el repositorio
- 💬 **Discussions**: Preguntas y sugerencias
- 📧 **Email**: Contacto directo para soporte

### Troubleshooting Rápido
```bash
# Verificar estado general
cd mobile && npm start
# Usar "Test de Conexión" en la app

# Logs detallados
cd backend && npm run start:dev
cd mobile && npx expo start --clear
```

---

## 📄 Información del Proyecto

**Versión**: `3.0.0`  
**Estado**: ✅ **Base Completa - Lista para Funcionalidades de Negocio**  
**Tecnologías**: React Native, Expo, NestJS, AWS, TypeScript  
**Plataformas**: iOS, Android, Web  

---

### 🎬 **Trinity - Decide qué película ver, juntos**

**¡La base técnica está 100% completa y lista para implementar las funcionalidades de votación de películas!** 🚀

#### **Lo que funciona AHORA:**
1. ✅ **Autenticación completa** (email + Google)
2. ✅ **App móvil funcional** en iOS, Android y Web
3. ✅ **Backend robusto** con AWS y seguridad enterprise
4. ✅ **Conectividad perfecta** entre frontend y backend
5. ✅ **Herramientas de testing** y debugging integradas

#### **Siguiente paso:**
Implementar las pantallas y funcionalidades de votación de películas usando toda la infraestructura ya construida.