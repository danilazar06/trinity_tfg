# 🔍 Guía de Debugging - Google Sign-In DEVELOPER_ERROR

## 📱 Nuevo APK con Logging Detallado

**URL de descarga**: https://expo.dev/artifacts/eas/sqtW8Cvji78Lzg94zYL2Wu.apk

Este APK incluye logging detallado que te ayudará a diagnosticar exactamente qué está causando el error `DEVELOPER_ERROR`.

## 🔧 Cómo Obtener Logs Detallados

### Opción 1: ADB Logcat (Recomendado)

1. **Conecta tu dispositivo por USB**
2. **Habilita "Depuración USB"** en Opciones de desarrollador
3. **Instala el nuevo APK** en tu dispositivo
4. **Abre una terminal/PowerShell** y ejecuta:

```bash
# Comando básico para ver todos los logs
adb logcat | findstr /i "trinity google cognito auth developer_error"

# O más específico para errores
adb logcat *:E | findstr /i "error developer"

# Para ver logs en tiempo real mientras usas la app
adb logcat | findstr /i "SimpleGoogleSignIn GoogleSignin"
```

### Opción 2: Filtros Específicos

```bash
# Solo logs de Google Sign-In
adb logcat | findstr /i "GoogleSignin"

# Solo logs de configuración
adb logcat | findstr /i "DEBUGGING Configuration"

# Solo errores críticos
adb logcat | findstr /i "DEVELOPER_ERROR DETAILED"
```

### Opción 3: Guardar Logs en Archivo

```bash
# Guardar todos los logs en un archivo
adb logcat > trinity_logs.txt

# Luego buscar en el archivo
findstr /i "developer_error google" trinity_logs.txt
```

## 🎯 Qué Buscar en los Logs

El nuevo APK incluye logs detallados que mostrarán:

### 1. Configuración de Google Sign-In
```
🔍 DEBUGGING - Configuration values:
- Web Client ID: 320120465080-4lf6l426q4ct2jn4mpgte9m5mbmlss7j.apps.googleusercontent.com
- Android Client ID: [valor actual]
- Package name should be: com.trinity.app
```

### 2. Error DEVELOPER_ERROR Detallado
```
❌ DETAILED SIGN-IN ERROR:
- Error code: [código específico]
- Error message: DEVELOPER_ERROR
- Full error object: [objeto completo del error]

🚨 DEVELOPER_ERROR DETECTED!
🔍 This error means Google Cloud Console configuration is incorrect:
   1. Go to: https://console.cloud.google.com/
   2. Select project: trinity-app-production
   [instrucciones detalladas]
```

### 3. Información de Debugging
```
🔍 IMPORTANT: For DEVELOPER_ERROR troubleshooting:
- Ensure google-services.json has correct Client IDs
- Ensure SHA-1 fingerprint is configured in Google Cloud Console
- Package name must be: com.trinity.app
```

## 📋 Pasos para Reproducir y Capturar Logs

1. **Instala el nuevo APK**: https://expo.dev/artifacts/eas/sqtW8Cvji78Lzg94zYL2Wu.apk
2. **Conecta el dispositivo por USB** y habilita depuración USB
3. **Inicia el comando de logging**:
   ```bash
   adb logcat | findstr /i "trinity google cognito auth developer_error"
   ```
4. **Abre Trinity** en tu dispositivo
5. **Toca "Iniciar sesión con Google"**
6. **Selecciona tu cuenta de Google**
7. **Cuando aparezca DEVELOPER_ERROR**, los logs detallados aparecerán en la terminal

## 🔍 Información Específica que Necesitamos

Una vez que captures los logs, busca específicamente:

### ✅ Configuración Actual
- ¿Qué Client ID está usando la app?
- ¿Está configurado correctamente el package name?
- ¿Se detecta google-services.json?

### ❌ Error Exacto
- ¿Cuál es el mensaje de error completo?
- ¿Hay códigos de error específicos?
- ¿En qué momento exacto falla?

### 🔧 Configuración de Google Cloud Console
- ¿Está configurado el SHA-1 fingerprint?
- ¿Coincide el package name (com.trinity.app)?
- ¿Es correcto el Client ID?

## 🚀 Próximos Pasos

1. **Captura los logs** siguiendo esta guía
2. **Comparte los logs relevantes** (especialmente las líneas con "DEVELOPER_ERROR" y "DEBUGGING")
3. **Basándome en los logs**, podré identificar exactamente qué configuración falta o está incorrecta
4. **Configuraremos Google Cloud Console** correctamente
5. **Compilaremos un APK final** que funcione

## 💡 Consejos Adicionales

- **Mantén la terminal abierta** mientras reproduces el error
- **Los logs aparecen en tiempo real**, así que verás exactamente cuándo falla
- **Si no ves logs**, verifica que la depuración USB esté habilitada
- **Si ADB no funciona**, también puedes usar Android Studio para ver logs

## 🔧 Verificar ADB

Para verificar que ADB funciona:

```bash
# Verificar que ADB está instalado
adb version

# Ver dispositivos conectados
adb devices

# Debería mostrar tu dispositivo como "device" (no "unauthorized")
```

Con estos logs detallados podremos identificar exactamente qué está causando el `DEVELOPER_ERROR` y solucionarlo definitivamente.