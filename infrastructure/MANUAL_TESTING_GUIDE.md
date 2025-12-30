# Trinity Backend - Manual Testing Guide

## 🎯 Objetivo
Esta guía proporciona instrucciones detalladas para probar manualmente todas las funcionalidades críticas del backend de Trinity, especialmente el algoritmo **Stop-on-Match** y el **Circuit Breaker**.

## 📋 Pre-requisitos

### Herramientas Necesarias
- **AWS CLI** configurado con credenciales
- **Node.js** (para ejecutar scripts de prueba)
- **Postman** o **curl** para pruebas de API
- **GraphQL Playground** o **Insomnia** (recomendado)

### Información de Despliegue
```bash
# Configuración de Producción
REGION=eu-west-1
GRAPHQL_ENDPOINT=https://imx6fos5lnd3xkdchl4rqtv4pi.appsync-api.eu-west-1.amazonaws.com/graphql
USER_POOL_ID=eu-west-1_6UxioIj4z
```

## 🧪 Pruebas Automatizadas (Smoke Test)

### 1. Ejecutar Smoke Test Completo
```bash
cd infrastructure
node scripts/smoke-test.js
```

**Resultado Esperado:**
- ✅ 7/7 pruebas pasadas
- Conectividad GraphQL funcionando
- Servicios TMDB y Hugging Face operativos
- Circuit Breaker respondiendo correctamente

## 🎮 Pruebas Manuales del Algoritmo Stop-on-Match

### Escenario 1: Flujo Completo de Votación (3 Usuarios)

#### Paso 1: Crear Usuario de Prueba
```bash
# Usar AWS CLI para crear usuario temporal
aws cognito-idp admin-create-user \
  --user-pool-id eu-west-1_6UxioIj4z \
  --username testuser1 \
  --temporary-password TempPass123! \
  --message-action SUPPRESS \
  --region eu-west-1
```

#### Paso 2: Crear Sala de Votación
```graphql
mutation CreateRoom {
  createRoom(input: {
    name: "Test Stop-on-Match"
    filters: {
      contentTypes: [movie]
      genres: ["28", "12"]  # Action, Adventure
    }
  }) {
    id
    name
    inviteCode
    status
  }
}
```

**Resultado Esperado:**
- Sala creada con estado `ACTIVE`
- Código de invitación generado
- ID de sala para siguientes pruebas

#### Paso 3: Simular Múltiples Usuarios Uniéndose
```graphql
mutation JoinRoom {
  joinRoom(inviteCode: "ABC123") {
    id
    name
    status
  }
}
```

**Ejecutar 2 veces más** con diferentes tokens de autenticación para simular 3 usuarios totales.

#### Paso 4: Probar Algoritmo Stop-on-Match

**Voto 1 (Usuario 1):**
```graphql
mutation Vote1 {
  vote(roomId: "room-id-aqui", movieId: "550") {
    id
    status
    resultMovieId
  }
}
```

**Resultado Esperado:**
- Estado: `ACTIVE` (aún no hay match)
- `resultMovieId`: null
- Evento en tiempo real publicado

**Voto 2 (Usuario 2):**
```graphql
mutation Vote2 {
  vote(roomId: "room-id-aqui", movieId: "550") {
    id
    status
    resultMovieId
  }
}
```

**Resultado Esperado:**
- Estado: `ACTIVE` (2/3 votos)
- `resultMovieId`: null

**Voto 3 (Usuario 3) - MATCH:**
```graphql
mutation Vote3 {
  vote(roomId: "room-id-aqui", movieId: "550") {
    id
    status
    resultMovieId
  }
}
```

**Resultado Esperado:**
- ✅ Estado: `MATCHED`
- ✅ `resultMovieId`: "550"
- ✅ Evento `onMatchFound` publicado
- ✅ Notificación a todos los participantes

### Escenario 2: Prevención de Votos Duplicados

#### Paso 1: Intentar Voto Duplicado
```graphql
mutation DuplicateVote {
  vote(roomId: "room-id-aqui", movieId: "550") {
    id
    status
  }
}
```

**Resultado Esperado:**
- ❌ Error: "Usuario ya votó por la película 550 en la sala"
- No se incrementa el contador de votos
- Integridad de datos mantenida

### Escenario 3: Monitoreo en Tiempo Real

#### Paso 1: Suscribirse a Actualizaciones de Votos
```graphql
subscription VoteUpdates {
  onVoteUpdate(roomId: "room-id-aqui") {
    roomId
    userId
    movieId
    voteType
    currentVotes
    totalMembers
    timestamp
  }
}
```

#### Paso 2: Suscribirse a Matches Encontrados
```graphql
subscription MatchFound {
  onMatchFound(roomId: "room-id-aqui") {
    roomId
    movieId
    movieTitle
    participants
    timestamp
  }
}
```

**Resultado Esperado:**
- Eventos en tiempo real recibidos inmediatamente
- Datos consistentes con el estado de la sala

## 🔧 Pruebas del Circuit Breaker

### Escenario 1: Funcionamiento Normal
```graphql
query TestTMDB {
  getMovieDetails(movieId: "550") {
    id
    title
    overview
  }
}
```

**Resultado Esperado:**
- Respuesta exitosa de TMDB
- Circuit Breaker en estado `CLOSED`
- Métricas de rendimiento registradas

### Escenario 2: Simular Falla de TMDB

#### Paso 1: Forzar Apertura del Circuit Breaker
```bash
# Usar película con ID inválido para forzar errores
for i in {1..6}; do
  curl -X POST $GRAPHQL_ENDPOINT \
    -H "Content-Type: application/json" \
    -d '{"query":"query{getMovieDetails(movieId:\"invalid-id\"){id title}}"}'
done
```

#### Paso 2: Verificar Estado del Circuit Breaker
```graphql
query TestAfterFailures {
  getMovieDetails(movieId: "550") {
    id
    title
  }
}
```

**Resultado Esperado:**
- Primeras 5 consultas: Errores de TMDB
- Consulta 6: Circuit Breaker se abre
- Consultas siguientes: Falla rápida sin llamar a TMDB
- Después de 60 segundos: Circuit Breaker intenta recuperación

### Escenario 3: Recuperación Automática

#### Paso 1: Esperar Timeout (60 segundos)
```bash
sleep 60
```

#### Paso 2: Probar Recuperación
```graphql
query TestRecovery {
  getMovieDetails(movieId: "550") {
    id
    title
  }
}
```

**Resultado Esperado:**
- Circuit Breaker en estado `HALF_OPEN`
- Si la consulta es exitosa: Estado cambia a `CLOSED`
- Si falla: Vuelve a estado `OPEN`

## 📊 Verificación de Métricas y Logs

### CloudWatch Logs
```bash
# Ver logs de Lambda functions
aws logs describe-log-groups \
  --log-group-name-prefix "/aws/lambda/TrinityMvpStack" \
  --region eu-west-1

# Ver logs específicos
aws logs get-log-events \
  --log-group-name "/aws/lambda/TrinityMvpStack-VoteHandler" \
  --log-stream-name "LATEST" \
  --region eu-west-1
```

### Métricas Esperadas en Logs
```json
{
  "metricType": "BUSINESS_EVENT",
  "eventType": "VOTE_CAST",
  "roomId": "room-123",
  "userId": "user-456"
}

{
  "metricType": "PERFORMANCE",
  "operation": "ProcessVote",
  "duration": 150,
  "success": true
}

{
  "metricType": "CUSTOM_METRIC",
  "metricName": "CircuitBreaker_State",
  "value": 0,
  "dimensions": {"Service": "TMDB_API", "State": "CLOSED"}
}
```

## 🚨 Casos de Error a Probar

### 1. Sala No Encontrada
```graphql
mutation VoteInvalidRoom {
  vote(roomId: "invalid-room-id", movieId: "550") {
    id
  }
}
```
**Esperado:** Error "Sala no encontrada"

### 2. Usuario No Autorizado
```graphql
# Sin token de autenticación
mutation UnauthorizedVote {
  vote(roomId: "room-id", movieId: "550") {
    id
  }
}
```
**Esperado:** Error de autenticación

### 3. Película Inválida
```graphql
mutation InvalidMovie {
  vote(roomId: "room-id", movieId: "invalid-movie") {
    id
  }
}
```
**Esperado:** Error de TMDB o fallback graceful

## ✅ Checklist de Validación

### Funcionalidad Core
- [ ] Creación de salas funciona
- [ ] Unión a salas con código funciona
- [ ] Algoritmo Stop-on-Match funciona correctamente
- [ ] Prevención de votos duplicados funciona
- [ ] Notificaciones en tiempo real funcionan

### Resiliencia
- [ ] Circuit Breaker se abre tras 5 fallas
- [ ] Circuit Breaker se recupera automáticamente
- [ ] Fallbacks funcionan cuando servicios externos fallan
- [ ] Manejo de errores es graceful

### Monitoreo
- [ ] Métricas de negocio se registran
- [ ] Métricas de rendimiento se registran
- [ ] Logs estructurados están disponibles
- [ ] CloudWatch recibe todas las métricas

### Seguridad
- [ ] Autenticación requerida para operaciones sensibles
- [ ] Autorización de usuarios funciona
- [ ] Validación de entrada funciona
- [ ] No hay exposición de datos sensibles

## 🎯 Criterios de Éxito

### Rendimiento
- Tiempo de respuesta < 500ms para operaciones normales
- Circuit Breaker responde < 50ms cuando está abierto
- Throughput > 100 operaciones/minuto

### Disponibilidad
- 99.9% uptime durante pruebas
- Recuperación automática de fallos
- Degradación graceful de servicios

### Funcionalidad
- 100% de casos de uso principales funcionando
- 0 votos duplicados permitidos
- Notificaciones en tiempo real < 2 segundos

---

## 📞 Soporte

Si encuentras problemas durante las pruebas:

1. **Revisar logs de CloudWatch**
2. **Verificar configuración de AWS**
3. **Comprobar conectividad de red**
4. **Validar tokens de autenticación**

**Logs importantes:**
- `/aws/lambda/TrinityMvpStack-VoteHandler`
- `/aws/lambda/TrinityMvpStack-MovieHandler`
- `/aws/lambda/TrinityMvpStack-AIHandler`