# 🏗️ Arquitectura Trinity MVP

## 📊 Visión General

Trinity sigue una arquitectura de microservicios serverless en AWS con separación clara de responsabilidades y diseño orientado a eventos.

## 🎯 Principios Arquitectónicos

### Clean Architecture
- **Separación de capas**: Domain, Infrastructure, Application, Presentation
- **Inversión de dependencias**: Las capas internas no dependen de las externas
- **Testabilidad**: Cada capa es testeable independientemente

### Microservicios Serverless
- **Funciones especializadas**: Cada Lambda maneja un dominio específico
- **Escalabilidad automática**: AWS maneja el scaling automáticamente
- **Pay-per-use**: Solo pagas por lo que usas

### Event-Driven Architecture
- **Eventos asíncronos**: Comunicación mediante eventos
- **Desacoplamiento**: Servicios independientes
- **Resilencia**: Fallos aislados no afectan todo el sistema

## 🏛️ Diagrama de Arquitectura

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Mobile App    │    │    Web Client    │    │  Admin Panel    │
│  (React Native) │    │   (Future)       │    │   (Future)      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────────────┐
                    │     AWS AppSync         │
                    │   (GraphQL Gateway)     │
                    └─────────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Auth Lambda   │    │   Room Lambda   │    │  Movie Lambda   │
│   (Cognito)     │    │ (Shuffle&Sync)  │    │   (TMDB API)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────────────┐
                    │      DynamoDB           │
                    │   (Multi-Table)         │
                    └─────────────────────────┘
```

## 🧩 Componentes Principales

### Frontend Layer
- **React Native App**: Aplicación móvil principal
- **Expo Framework**: Desarrollo y deployment simplificado
- **TypeScript**: Type safety y mejor DX

### API Gateway Layer
- **AWS AppSync**: GraphQL API con subscriptions en tiempo real
- **REST Endpoints**: APIs REST para operaciones específicas
- **Authentication**: JWT + AWS Cognito integration

### Business Logic Layer (NestJS Backend)
- **19 Módulos Especializados**: Cada uno maneja un dominio específico
- **Clean Architecture**: Separación clara de responsabilidades
- **Property-Based Testing**: Tests con 100+ iteraciones

### Infrastructure Layer
- **AWS Lambda**: 6 funciones serverless especializadas
- **DynamoDB**: Base de datos NoSQL con diseño multi-tabla
- **AWS Cognito**: Gestión de usuarios y autenticación
- **CloudFront**: CDN para optimización de contenido

## 📦 Módulos del Backend

### Core Modules
```typescript
├── AuthModule          // Autenticación y autorización
├── RoomModule          // Gestión de salas y miembros
├── MediaModule         // Contenido multimedia (TMDB)
├── InteractionModule   // Sistema de swipes y votación
├── MatchModule         // Detección de consenso
└── VoteModule          // Gestión de votaciones
```

### Advanced Features
```typescript
├── AIModule                    // IA Salamandra/ALIA
├── AnalyticsModule            // Métricas e insights
├── RoomAutomationModule       // Automatización inteligente
├── PermissionModule           // Sistema de permisos avanzado
├── SemanticAnalysisModule     // Análisis semántico
├── CDNModule                  // Optimización de imágenes
├── CostOptimizationModule     // Optimización de costos AWS
└── RealtimeModule             // WebSockets y tiempo real
```

### Infrastructure Modules
```typescript
├── DatabaseModule      // DynamoDB multi-tabla
├── CognitoModule      // AWS Cognito integration
├── TMDBModule         // The Movie Database API
├── CircuitBreakerModule // Resilencia ante fallos
└── GraphQLModule      // Resolvers GraphQL
```

## 🗄️ Diseño de Base de Datos

### Estrategia Multi-Table (DynamoDB)

#### 1. UsersTable
```typescript
PK: userId
Attributes: email, name, preferences, createdAt, lastActiveAt
```

#### 2. RoomsTable
```typescript
PK: roomId
Attributes: name, adminId, status, settings, createdAt, memberCount
```

#### 3. RoomMembersTable
```typescript
PK: roomId
SK: userId
GSI: UserHistoryIndex (userId, joinedAt)
Attributes: role, status, joinedAt, lastActiveAt
```

#### 4. VotesTable
```typescript
PK: roomId
SK: movieId#userId
Attributes: vote, timestamp, sessionId
```

#### 5. MoviesCacheTable
```typescript
PK: tmdbId
TTL: 30 días
Attributes: title, overview, genres, poster_path, cached_at
```

## 🔄 Flujos de Datos Principales

### 1. Flujo de Autenticación
```
User → Mobile App → AWS Cognito → JWT Token → Backend Validation → User Session
```

### 2. Flujo de Creación de Sala
```
User → Create Room → RoomService → DynamoDB → Shuffle&Sync → Ready for Voting
```

### 3. Flujo de Votación
```
User Swipe → InteractionService → VoteService → MatchService → Consensus Detection
```

### 4. Flujo de Recomendaciones IA
```
User Context → AIService → Salamandra/ALIA → TMDB Integration → Personalized Content
```

## 🚀 Patrones de Diseño Implementados

### Repository Pattern
- **Abstracción de datos**: Interfaces para acceso a datos
- **Testabilidad**: Mocks fáciles para testing
- **Flexibilidad**: Cambio de proveedores sin afectar lógica

### Circuit Breaker Pattern
- **Resilencia**: Protección ante fallos de APIs externas
- **Fallback**: Respuestas alternativas cuando servicios fallan
- **Monitoring**: Métricas de salud de servicios externos

### Event Sourcing (Parcial)
- **Audit Trail**: Historial completo de eventos
- **Analytics**: Datos para análisis de comportamiento
- **Debugging**: Trazabilidad completa de acciones

### CQRS (Command Query Responsibility Segregation)
- **Separación**: Comandos vs Queries optimizados independientemente
- **Performance**: Lecturas y escrituras optimizadas por separado
- **Escalabilidad**: Scaling independiente por tipo de operación

## 🔐 Seguridad

### Autenticación y Autorización
- **JWT Tokens**: Stateless authentication
- **AWS Cognito**: Gestión centralizada de usuarios
- **Role-Based Access**: Permisos granulares por rol
- **API Key Protection**: Rate limiting y throttling

### Protección de Datos
- **Encryption at Rest**: DynamoDB encriptado
- **Encryption in Transit**: HTTPS/TLS en todas las comunicaciones
- **Secrets Management**: Variables de entorno seguras
- **Input Validation**: Validación estricta en todos los endpoints

## 📊 Monitoring y Observabilidad

### Métricas
- **CloudWatch**: Métricas de infraestructura AWS
- **Custom Metrics**: Métricas de negocio específicas
- **Performance Monitoring**: Latencia, throughput, errores
- **Cost Monitoring**: Optimización automática de costos

### Logging
- **Structured Logging**: Logs en formato JSON
- **Correlation IDs**: Trazabilidad de requests
- **Error Tracking**: Captura y análisis de errores
- **Audit Logs**: Registro de acciones críticas

### Alerting
- **SNS Notifications**: Alertas por email/SMS
- **Budget Alerts**: Alertas de costos AWS
- **Health Checks**: Monitoreo de salud de servicios
- **Performance Alerts**: Alertas por degradación de performance

## 🎯 Optimizaciones de Performance

### Database Optimizations
- **Query Optimization**: Índices optimizados para patrones de acceso
- **Caching Strategy**: Caché inteligente con TTL
- **Data Archival**: Archivado automático de datos antiguos
- **Connection Pooling**: Reutilización de conexiones

### API Optimizations
- **Response Compression**: Compresión automática de respuestas
- **Payload Optimization**: Minimización de datos transferidos
- **Caching Headers**: Caché HTTP inteligente
- **Rate Limiting**: Protección contra abuso

### Real-time Optimizations
- **Connection Management**: Gestión eficiente de WebSockets
- **Event Broadcasting**: Optimización de eventos en tiempo real
- **Memory Usage**: Optimización de uso de memoria
- **Scalability**: Scaling automático basado en carga

## 📈 Escalabilidad

### Horizontal Scaling
- **Lambda Auto-scaling**: Scaling automático de funciones
- **DynamoDB On-demand**: Scaling automático de base de datos
- **CDN Distribution**: Distribución global de contenido
- **Load Balancing**: Distribución automática de carga

### Vertical Scaling
- **Memory Optimization**: Optimización de uso de memoria
- **CPU Optimization**: Optimización de procesamiento
- **Storage Optimization**: Optimización de almacenamiento
- **Network Optimization**: Optimización de red

## 🔮 Arquitectura Futura

### Próximas Mejoras
- **Machine Learning Pipeline**: ML para recomendaciones avanzadas
- **Multi-region Deployment**: Despliegue global
- **Advanced Analytics**: Analytics en tiempo real
- **Microservices Decomposition**: Separación adicional de servicios

### Tecnologías Emergentes
- **GraphQL Subscriptions**: Tiempo real avanzado
- **Event Streaming**: Apache Kafka o AWS Kinesis
- **Container Orchestration**: ECS o EKS para servicios complejos
- **Edge Computing**: Lambda@Edge para latencia ultra-baja

---

**Última actualización**: 29 de diciembre de 2025  
**Arquitecto**: Equipo Trinity MVP