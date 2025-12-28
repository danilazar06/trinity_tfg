# 📚 API Reference - Trinity MVP

## 🌐 Base URLs

- **Development**: `http://localhost:3000`
- **Production**: `https://api.trinity.app` (Future)
- **GraphQL**: AWS AppSync endpoint (see infrastructure outputs)

## 🔐 Autenticación

Todos los endpoints protegidos requieren un JWT token en el header:

```http
Authorization: Bearer <jwt_token>
```

## 📋 Endpoints por Módulo

### 🔑 Authentication Module

#### POST /auth/register
Registrar nuevo usuario

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "name": "John Doe"
}
```

**Response:**
```json
{
  "user": {
    "id": "user-123",
    "email": "user@example.com",
    "name": "John Doe"
  },
  "tokens": {
    "accessToken": "jwt_token_here",
    "refreshToken": "refresh_token_here"
  }
}
```

#### POST /auth/login
Iniciar sesión

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

#### POST /auth/refresh
Renovar token de acceso

**Request:**
```json
{
  "refreshToken": "refresh_token_here"
}
```

#### GET /auth/profile
Obtener perfil del usuario autenticado

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "id": "user-123",
  "email": "user@example.com",
  "name": "John Doe",
  "preferences": {
    "genres": ["Action", "Comedy"],
    "language": "es"
  }
}
```

### 🏠 Room Module

#### POST /rooms
Crear nueva sala

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "name": "Movie Night",
  "description": "Friday night movies",
  "settings": {
    "maxMembers": 10,
    "votingTimeout": 300,
    "consensusThreshold": 0.8
  }
}
```

**Response:**
```json
{
  "id": "room-456",
  "name": "Movie Night",
  "adminId": "user-123",
  "status": "active",
  "inviteCode": "ABC123",
  "createdAt": "2025-12-29T00:00:00Z"
}
```

#### GET /rooms/:roomId
Obtener detalles de sala

#### POST /rooms/:roomId/join
Unirse a sala

**Request:**
```json
{
  "inviteCode": "ABC123"
}
```

#### GET /rooms/:roomId/members
Obtener miembros de la sala

**Response:**
```json
{
  "members": [
    {
      "userId": "user-123",
      "name": "John Doe",
      "role": "admin",
      "status": "active",
      "joinedAt": "2025-12-29T00:00:00Z"
    }
  ]
}
```

### 🎬 Media Module

#### GET /media/search
Buscar contenido multimedia

**Query Parameters:**
- `query`: Término de búsqueda
- `type`: "movie" | "tv"
- `page`: Número de página (default: 1)

**Example:**
```http
GET /media/search?query=avengers&type=movie&page=1
```

**Response:**
```json
{
  "results": [
    {
      "id": "299536",
      "title": "Avengers: Infinity War",
      "overview": "As the Avengers and their allies...",
      "poster_path": "/7WsyChQLEftFiDOVTGkv3hFpyyt.jpg",
      "release_date": "2018-04-25",
      "vote_average": 8.3,
      "genres": ["Action", "Adventure", "Science Fiction"]
    }
  ],
  "total_pages": 42,
  "total_results": 834
}
```

#### GET /media/:mediaId
Obtener detalles de contenido específico

### 🗳️ Interaction Module

#### POST /interactions/vote
Registrar voto (swipe)

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "roomId": "room-456",
  "mediaId": "299536",
  "vote": "like", // "like" | "dislike" | "super_like"
  "sessionId": "session-789"
}
```

**Response:**
```json
{
  "voteId": "vote-101",
  "processed": true,
  "matchDetected": false,
  "queuePosition": 15
}
```

#### GET /interactions/queue/:roomId
Obtener cola de votación para la sala

**Response:**
```json
{
  "queue": [
    {
      "mediaId": "299536",
      "position": 1,
      "title": "Avengers: Infinity War",
      "poster_path": "/7WsyChQLEftFiDOVTGkv3hFpyyt.jpg"
    }
  ],
  "totalItems": 50,
  "currentPosition": 1
}
```

### 🎯 Match Module

#### GET /matches/:roomId
Obtener matches de la sala

**Response:**
```json
{
  "matches": [
    {
      "id": "match-202",
      "mediaId": "299536",
      "title": "Avengers: Infinity War",
      "matchedAt": "2025-12-29T01:00:00Z",
      "votes": {
        "like": 8,
        "dislike": 0,
        "super_like": 2
      },
      "consensus": "unanimous"
    }
  ]
}
```

#### POST /matches/:roomId/:matchId/rate
Calificar match después de verlo

**Request:**
```json
{
  "rating": 4.5,
  "review": "Great movie night!"
}
```

### 🧠 AI Module (Salamandra/ALIA)

#### POST /ai/chat-recommendations
Obtener recomendaciones basadas en contexto emocional

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "userText": "Me siento muy estresado por el trabajo y necesito relajarme"
}
```

**Response:**
```json
{
  "movies": ["19404", "9806", "105"],
  "reasoning": "Salamandra recomienda Comedia, Animación basado en tu estado emocional.",
  "confidence": 0.85,
  "emotionalState": "stressed",
  "suggestedGenres": ["Comedia", "Animación", "Familiar"]
}
```

#### GET /ai/health
Verificar estado de la IA

### 📊 Analytics Module

#### GET /analytics/dashboard
Dashboard general de analytics

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "overview": {
    "totalUsers": 1250,
    "activeRooms": 45,
    "totalMatches": 3420,
    "avgSessionDuration": 1800
  },
  "trends": {
    "userGrowth": 15.2,
    "engagementRate": 78.5,
    "matchSuccessRate": 65.3
  }
}
```

#### GET /analytics/user-behavior
Análisis de comportamiento de usuarios

#### GET /analytics/room-performance
Rendimiento y optimización de salas

#### GET /analytics/content-preferences
Preferencias y tendencias de contenido

### 🤖 Room Automation Module

#### POST /room-automation/:roomId/config
Configurar automatización de sala

**Request:**
```json
{
  "level": "intermediate", // "basic" | "intermediate" | "advanced" | "custom"
  "settings": {
    "autoOptimizeContent": true,
    "smartSessionManagement": true,
    "memberEngagementOptimization": true
  }
}
```

#### GET /room-automation/:roomId/recommendations
Obtener recomendaciones inteligentes

#### POST /room-automation/:roomId/optimize
Ejecutar optimización manual

### 🔐 Permission Module

#### GET /permissions/check
Verificar permisos del usuario

**Query Parameters:**
- `resource`: Recurso a verificar
- `action`: Acción a verificar

**Example:**
```http
GET /permissions/check?resource=room:456&action=moderate
```

#### POST /permissions/grant
Otorgar permisos (solo admins)

### 💬 Room Chat Module

#### GET /chat/:roomId/messages
Obtener mensajes del chat de la sala

#### POST /chat/:roomId/messages
Enviar mensaje al chat

**Request:**
```json
{
  "content": "¿Qué les parece esta película?",
  "type": "text", // "text" | "media" | "system"
  "replyTo": "message-123" // opcional
}
```

#### POST /chat/:roomId/messages/:messageId/react
Reaccionar a un mensaje

### 💡 Content Suggestion Module

#### GET /suggestions/:roomId
Obtener sugerencias de contenido

#### POST /suggestions/:roomId
Crear nueva sugerencia

**Request:**
```json
{
  "mediaId": "299536",
  "reason": "Perfect for our group's taste",
  "priority": "high" // "low" | "medium" | "high"
}
```

#### POST /suggestions/:roomId/:suggestionId/vote
Votar en una sugerencia

## 🔄 WebSocket Events (Real-time)

### Conexión
```javascript
const socket = io('ws://localhost:3000/realtime', {
  auth: {
    token: 'jwt_token_here'
  }
});
```

### Eventos de Sala
```javascript
// Unirse a sala
socket.emit('joinRoom', { roomId: 'room-456' });

// Escuchar actualizaciones de votos
socket.on('voteUpdate', (data) => {
  console.log('New vote:', data);
});

// Escuchar matches encontrados
socket.on('matchFound', (data) => {
  console.log('Match found:', data);
});

// Cambios de estado de sala
socket.on('roomStateChanged', (data) => {
  console.log('Room state changed:', data);
});
```

## 📈 Rate Limits

- **Authentication endpoints**: 5 requests/minute
- **General API**: 100 requests/minute
- **Real-time events**: 1000 events/minute
- **File uploads**: 10 uploads/minute

## 🚨 Error Responses

### Formato Estándar
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": {
      "field": "email",
      "reason": "Invalid email format"
    },
    "timestamp": "2025-12-29T00:00:00Z",
    "requestId": "req-123"
  }
}
```

### Códigos de Error Comunes
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `422` - Validation Error
- `429` - Rate Limited
- `500` - Internal Server Error

## 🧪 Testing

### Swagger UI
Disponible en: `http://localhost:3000/api`

### Postman Collection
Importar colección desde: `/docs/development/trinity-api.postman_collection.json`

### GraphQL Playground
Disponible en el endpoint de AWS AppSync

---

**Última actualización**: 29 de diciembre de 2025  
**Versión API**: v1.0.0