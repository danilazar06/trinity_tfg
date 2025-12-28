# 🚀 Guía Completa: Implementar Google OAuth en Trinity

## 📋 Resumen
Esta guía te llevará paso a paso desde crear el proyecto en Google Cloud Console hasta tener Google OAuth funcionando completamente en Trinity.

**Tiempo estimado:** 30-45 minutos  
**Costo:** 100% GRATIS  
**Requisitos:** Cuenta de Google

---

## 🎯 FASE 1: CONFIGURACIÓN EN GOOGLE CLOUD CONSOLE

### Paso 1.1: Crear Proyecto en Google Cloud Console

1. **Ir a Google Cloud Console**
   ```
   🌐 https://console.cloud.google.com/
   ```

2. **Crear nuevo proyecto**
   - Clic en el selector de proyecto (arriba izquierda)
   - Clic en "NEW PROJECT"
   - **Project name:** `Trinity`
   - **Project ID:** `trinity-auth-[número-aleatorio]` (se genera automáticamente)
   - Clic en "CREATE"

3. **Esperar a que se cree el proyecto** (1-2 minutos)

### Paso 1.2: Habilitar APIs Necesarias

1. **Ir a APIs & Services > Library**
   ```
   🔍 En el menú lateral: APIs & Services > Library
   ```

2. **Habilitar Google+ API** (para obtener perfil de usuario)
   - Buscar: "Google+ API"
   - Clic en "Google+ API"
   - Clic en "ENABLE"

3. **Habilitar Identity and Access Management (IAM) API**
   - Buscar: "Identity and Access Management"
   - Clic en "Identity and Access Management (IAM) API"
   - Clic en "ENABLE"

### Paso 1.3: Configurar OAuth Consent Screen

1. **Ir a OAuth consent screen**
   ```
   🔍 En el menú lateral: APIs & Services > OAuth consent screen
   ```

2. **Seleccionar tipo de usuario**
   - Seleccionar **"External"** (para que cualquier usuario con cuenta de Google pueda usar tu app)
   - Clic en "CREATE"

3. **Completar información de la app**
   ```
   App name: Trinity
   User support email: [tu-email@gmail.com]
   App logo: [opcional - puedes subir el logo de Trinity]
   
   App domain (opcional):
   Application home page: http://localhost:3000
   Application privacy policy link: [dejar vacío por ahora]
   Application terms of service link: [dejar vacío por ahora]
   
   Developer contact information:
   Email addresses: [tu-email@gmail.com]
   ```

4. **Configurar Scopes (permisos)**
   - Clic en "ADD OR REMOVE SCOPES"
   - Seleccionar estos scopes:
     ```
     ✅ openid
     ✅ email
     ✅ profile
     ```
   - Clic en "UPDATE"

5. **Test users (opcional para desarrollo)**
   - Agregar tu email y otros emails de prueba
   - Clic en "ADD USERS"

6. **Revisar y confirmar**
   - Clic en "SAVE AND CONTINUE" en cada paso
   - Al final, clic en "BACK TO DASHBOARD"

### Paso 1.4: Crear Credenciales OAuth 2.0

#### 🌐 Credencial para WEB (Backend)

1. **Ir a Credentials**
   ```
   🔍 En el menú lateral: APIs & Services > Credentials
   ```

2. **Crear credencial Web**
   - Clic en "+ CREATE CREDENTIALS"
   - Seleccionar "OAuth 2.0 Client IDs"
   - **Application type:** Web application
   - **Name:** `Trinity Backend`

3. **Configurar URLs autorizadas**
   ```
   Authorized JavaScript origins:
   http://localhost:3000
   http://192.168.1.59:3000
   
   Authorized redirect URIs:
   http://localhost:3000/auth/google/callback
   http://192.168.1.59:3000/auth/google/callback
   ```

4. **Guardar credenciales**
   - Clic en "CREATE"
   - **¡IMPORTANTE!** Copiar y guardar:
     - `Client ID` (algo como: 123456789-abcdefg.apps.googleusercontent.com)
     - `Client secret` (algo como: GOCSPX-abcdefghijklmnop)

#### 📱 Credencial para ANDROID

1. **Crear nueva credencial**
   - Clic en "+ CREATE CREDENTIALS"
   - Seleccionar "OAuth 2.0 Client IDs"
   - **Application type:** Android
   - **Name:** `Trinity Android`

2. **Configurar Android**
   ```
   Package name: com.trinity.app
   SHA-1 certificate fingerprint: [ver instrucciones abajo]
   ```

3. **Obtener SHA-1 fingerprint (para desarrollo)**
   ```bash
   # En Windows (PowerShell):
   keytool -list -v -keystore "%USERPROFILE%\.android\debug.keystore" -alias androiddebugkey -storepass android -keypass android
   
   # Buscar la línea que dice "SHA1:" y copiar el valor
   # Ejemplo: SHA1: A1:B2:C3:D4:E5:F6:G7:H8:I9:J0:K1:L2:M3:N4:O5:P6:Q7:R8:S9:T0
   ```

4. **Guardar credencial Android**
   - Pegar el SHA-1 fingerprint
   - Clic en "CREATE"
   - Copiar el `Client ID` generado

#### 🍎 Credencial para iOS

1. **Crear nueva credencial**
   - Clic en "+ CREATE CREDENTIALS"
   - Seleccionar "OAuth 2.0 Client IDs"
   - **Application type:** iOS
   - **Name:** `Trinity iOS`

2. **Configurar iOS**
   ```
   Bundle ID: com.trinity.app
   ```

3. **Guardar credencial iOS**
   - Clic en "CREATE"
   - Copiar el `Client ID` generado

---

## 🔧 FASE 2: CONFIGURAR VARIABLES DE ENTORNO

### Paso 2.1: Actualizar Backend (.env)

```bash
# Abrir: trinity_tfg/backend/.env
# Reemplazar estas líneas:

# Google OAuth Configuration
GOOGLE_CLIENT_ID=TU_WEB_CLIENT_ID_AQUI
GOOGLE_CLIENT_SECRET=TU_CLIENT_SECRET_AQUI
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
COGNITO_GOOGLE_PROVIDER_NAME=Google
```

### Paso 2.2: Actualizar Frontend (app.json)

```json
{
  "expo": {
    "extra": {
      "googleWebClientId": "TU_WEB_CLIENT_ID_AQUI",
      "googleIosClientId": "TU_IOS_CLIENT_ID_AQUI",
      "googleAndroidClientId": "TU_ANDROID_CLIENT_ID_AQUI"
    }
  }
}
```

---

## ☁️ FASE 3: CONFIGURAR AWS COGNITO

### Paso 3.1: Agregar Google como Identity Provider

1. **Ir a AWS Console > Cognito**
   ```
   🌐 https://console.aws.amazon.com/cognito/
   ```

2. **Seleccionar tu User Pool**
   - Buscar: `eu-west-1_6UxioIj4z`
   - Clic en el User Pool

3. **Agregar Identity Provider**
   - Ir a: **Sign-in experience** (menú lateral)
   - Scroll down a **"Federated identity provider sign-in"**
   - Clic en **"Add identity provider"**

4. **Configurar Google Provider**
   ```
   Provider type: Google
   Provider name: Google
   Client ID: [TU_WEB_CLIENT_ID_AQUI]
   Client secret: [TU_CLIENT_SECRET_AQUI]
   Authorize scopes: openid email profile
   ```

5. **Configurar Attribute Mapping**
   ```
   Google attribute -> User pool attribute
   email           -> email
   name            -> name
   picture         -> picture
   ```

6. **Guardar configuración**
   - Clic en **"Add identity provider"**

### Paso 3.2: Actualizar App Client

1. **Ir a App integration**
   - En el menú lateral: **App integration**
   - Scroll down a **"App clients and analytics"**
   - Clic en tu app client existente

2. **Habilitar Google en Hosted UI**
   - Scroll down a **"Hosted UI"**
   - Clic en **"Edit"**
   - En **"Identity providers"**: ✅ Marcar **Google**
   - En **"Callback URLs"**: Agregar:
     ```
     http://localhost:8081/
     trinity://auth/callback
     ```

3. **Guardar cambios**
   - Clic en **"Save changes"**

---

## 🧪 FASE 4: PROBAR LA CONFIGURACIÓN

### Paso 4.1: Reiniciar Servicios

```bash
# 1. Parar backend y frontend
# 2. Reiniciar backend
cd trinity_tfg/backend
npm run start:dev

# 3. Reiniciar frontend  
cd trinity_tfg/mobile
npx expo start --clear
```

### Paso 4.2: Probar en la App

1. **Abrir la app en tu dispositivo**
2. **Ir a pantalla de Login**
3. **Clic en "Continuar con Google"**
4. **Debería abrir el navegador con la pantalla de Google**
5. **Iniciar sesión con tu cuenta de Google**
6. **Debería redirigir de vuelta a la app**

---

## 🔍 FASE 5: VERIFICAR QUE FUNCIONA

### Paso 5.1: Logs del Backend

```bash
# En la consola del backend deberías ver:
✅ Google Sign-In configurado correctamente
✅ Usuario autenticado con Google: [email]
✅ Token JWT generado correctamente
```

### Paso 5.2: Logs del Frontend

```bash
# En la consola de Expo deberías ver:
✅ Google Sign-In exitoso: [email]
✅ Usuario autenticado correctamente
✅ Navegando a pantalla principal
```

### Paso 5.3: Verificar en AWS Cognito

1. **Ir a AWS Console > Cognito > User Pool**
2. **Ir a "Users"**
3. **Deberías ver tu usuario con:**
   - Email verificado
   - Proveedor: Google
   - Estado: Confirmed

---

## 🚨 SOLUCIÓN DE PROBLEMAS COMUNES

### Error: "Google Sign-In SDK no está disponible"
```
✅ SOLUCIÓN: Esto es normal en Expo Go
- Para probar completamente, necesitas crear un build de desarrollo
- O usar un emulador/dispositivo físico con build nativo
```

### Error: "Client ID not found"
```
✅ SOLUCIÓN: Verificar que:
- El Client ID esté copiado correctamente (sin espacios)
- El archivo .env esté guardado
- El backend esté reiniciado
```

### Error: "Redirect URI mismatch"
```
✅ SOLUCIÓN: Verificar que las URLs en Google Console coincidan:
- http://localhost:3000/auth/google/callback
- http://192.168.1.59:3000/auth/google/callback
```

### Error: "Access blocked: This app's request is invalid"
```
✅ SOLUCIÓN: 
- Verificar que el OAuth consent screen esté configurado
- Agregar tu email como test user
- Verificar que los scopes estén configurados (openid, email, profile)
```

---

## 📝 CHECKLIST FINAL

### ✅ Google Cloud Console
- [ ] Proyecto creado
- [ ] APIs habilitadas (Google+ API, IAM API)
- [ ] OAuth consent screen configurado
- [ ] Credencial Web creada
- [ ] Credencial Android creada
- [ ] Credencial iOS creada

### ✅ Variables de Entorno
- [ ] Backend .env actualizado con Client ID y Secret
- [ ] Frontend app.json actualizado con Client IDs

### ✅ AWS Cognito
- [ ] Google agregado como Identity Provider
- [ ] Attribute mapping configurado
- [ ] App client actualizado con Google habilitado

### ✅ Testing
- [ ] Backend reiniciado
- [ ] Frontend reiniciado
- [ ] Botón "Continuar con Google" funciona
- [ ] Login con Google exitoso
- [ ] Usuario aparece en AWS Cognito

---

## 🎉 ¡LISTO!

Si completaste todos los pasos, Google OAuth debería estar funcionando completamente en Trinity.

**Próximos pasos opcionales:**
- Configurar archivos google-services.json para Android
- Configurar GoogleService-Info.plist para iOS
- Crear build de desarrollo para testing completo
- Implementar logout de Google
- Agregar manejo de errores avanzado

**¿Necesitas ayuda?** Revisa la sección de solución de problemas o pregúntame cualquier duda específica.