# Guía de Configuración - Google OAuth para Trinity

## 📋 Estado Actual de la Implementación

### ✅ Completado
- **Backend**: GoogleAuthService y GoogleAuthController implementados
- **Frontend**: GoogleSignInService y AuthContext extendido con métodos de Google
- **UI**: Botones de Google OAuth agregados a pantallas de login y register
- **Integración**: Flujo completo de autenticación implementado

### ⚠️ Pendiente de Configuración
- **Credenciales de Google**: Necesita configuración real en Google Cloud Console
- **Variables de entorno**: Actualmente usando placeholders
- **Testing**: Requiere credenciales reales para pruebas completas

### 🔧 Para Activar Google OAuth

1. Sigue los pasos de configuración a continuación
2. Reemplaza los placeholders en `.env` con credenciales reales
3. Reinicia el backend para aplicar cambios
4. Prueba el flujo completo en la aplicación móvil

---

## 🚀 Configuración de Google Cloud Console

### Paso 1: Crear Proyecto en Google Cloud Console

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un nuevo proyecto o selecciona uno existente
3. Nombre sugerido: `trinity-auth`

### Paso 2: Habilitar APIs Necesarias

1. Ve a **APIs & Services > Library**
2. Busca y habilita:
   - **Google+ API** (para obtener información de perfil)
   - **Google Identity and Access Management (IAM) API**

### Paso 3: Configurar OAuth Consent Screen

1. Ve a **APIs & Services > OAuth consent screen**
2. Selecciona **External** (para usuarios fuera de tu organización)
3. Completa la información requerida:
   ```
   App name: Trinity
   User support email: tu-email@ejemplo.com
   Developer contact information: tu-email@ejemplo.com
   ```
4. En **Scopes**, agrega:
   - `openid`
   - `email` 
   - `profile`
5. Guarda y continúa

### Paso 4: Crear Credenciales OAuth 2.0

#### Para Web (Backend)
1. Ve a **APIs & Services > Credentials**
2. Clic en **+ CREATE CREDENTIALS > OAuth 2.0 Client IDs**
3. Tipo de aplicación: **Web application**
4. Nombre: `Trinity Backend`
5. **Authorized redirect URIs**:
   ```
   http://localhost:3000/auth/google/callback
   https://tu-dominio.com/auth/google/callback
   ```
6. Guarda el **Client ID** y **Client Secret**

#### Para Android
1. Crear nueva credencial OAuth 2.0
2. Tipo: **Android**
3. Nombre: `Trinity Android`
4. **Package name**: `com.trinity.app` (o el que uses)
5. **SHA-1 certificate fingerprint**: 
   ```bash
   # Para desarrollo (debug keystore)
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
   ```

#### Para iOS
1. Crear nueva credencial OAuth 2.0
2. Tipo: **iOS**
3. Nombre: `Trinity iOS`
4. **Bundle ID**: `com.trinity.app` (debe coincidir con tu app)

### Paso 5: Configurar Variables de Entorno

Agrega estas variables a tus archivos `.env`:

#### Backend (.env)
```bash
# Google OAuth Configuration
GOOGLE_CLIENT_ID=tu_web_client_id_aqui
GOOGLE_CLIENT_SECRET=tu_client_secret_aqui
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
```

#### Mobile (app.config.js o similar)
```javascript
export default {
  expo: {
    // ... otras configuraciones
    extra: {
      googleWebClientId: "tu_web_client_id_aqui",
      googleIosClientId: "tu_ios_client_id_aqui", // opcional
      googleAndroidClientId: "tu_android_client_id_aqui", // opcional
    },
  },
};
```

## 🔧 Configuración de AWS Cognito

### Paso 1: Agregar Google como Identity Provider

1. Ve a AWS Console > Cognito > User Pools
2. Selecciona tu User Pool existente (`eu-west-1_6UxioIj4z`)
3. Ve a **Sign-in experience > Federated identity provider sign-in**
4. Clic en **Add identity provider**
5. Selecciona **Google**
6. Configura:
   ```
   Provider name: Google
   Client ID: tu_web_client_id_aqui
   Client secret: tu_client_secret_aqui
   Authorize scopes: openid email profile
   ```

### Paso 2: Configurar Attribute Mapping

En la configuración del Identity Provider:
```
Google attribute -> User pool attribute
email           -> email
name            -> name
picture         -> picture
```

### Paso 3: Actualizar App Client

1. Ve a **App integration > App clients**
2. Selecciona tu app client existente
3. En **Hosted UI settings**:
   - Habilita **Google** en Identity providers
   - Agrega callback URLs:
     ```
     http://localhost:8081/
     trinity://auth/callback
     ```

## 📱 URLs de Callback para Mobile

Para React Native, necesitarás configurar deep linking:

### Android (android/app/src/main/AndroidManifest.xml)
```xml
<activity
    android:name=".MainActivity"
    android:exported="true"
    android:launchMode="singleTask">
    
    <!-- Existing intent filters -->
    
    <!-- Google OAuth callback -->
    <intent-filter android:autoVerify="true">
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="trinity" android:host="auth" />
    </intent-filter>
</activity>
```

### iOS (ios/Trinity/Info.plist)
```xml
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLName</key>
        <string>trinity.auth</string>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>trinity</string>
        </array>
    </dict>
</array>
```

## ✅ Verificación de Configuración

Una vez completada la configuración, verifica:

1. **Google Cloud Console**: Credenciales creadas para web, Android e iOS
2. **AWS Cognito**: Google configurado como Identity Provider
3. **Variables de entorno**: Client IDs y secrets configurados
4. **Deep linking**: URLs de callback configuradas en mobile

## 🔐 Consideraciones de Seguridad

- ✅ Usa HTTPS en producción
- ✅ Mantén los Client Secrets seguros (solo en backend)
- ✅ Configura dominios autorizados en Google Console
- ✅ Implementa validación de estado CSRF
- ✅ Usa almacenamiento seguro para tokens en mobile

## 📞 Soporte

Si encuentras problemas:
1. Verifica que las APIs estén habilitadas en Google Cloud
2. Confirma que los Client IDs coincidan exactamente
3. Revisa que las URLs de callback estén bien configuradas
4. Verifica que el OAuth consent screen esté configurado correctamente