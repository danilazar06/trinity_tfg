# Trinity MVP - Infraestructura Serverless AWS CDK

Infraestructura completa para Trinity MVP usando AWS CDK con arquitectura de microservicios serverless.

## Arquitectura

### Componentes Principales

1. **Autenticación**: AWS Cognito (User Pool & Client)
2. **API**: AWS AppSync (GraphQL) con autorización Cognito + API Key
3. **Computación**: 5 Funciones AWS Lambda independientes (Node.js 20.x)
4. **Base de Datos**: Amazon DynamoDB (Estrategia Multi-Table)
5. **IA**: Integración con Hugging Face Inference API (Salamandra-7b-instruct)

### Funciones Lambda

- **AuthHandler**: Post-confirmation trigger de Cognito
- **RoomHandler**: Gestión de salas (crear, unirse, historial)
- **MovieHandler**: Circuit breaker para TMDB API con cache
- **VoteHandler**: Algoritmo Stop-on-Match para votaciones
- **AIHandler**: Recomendaciones contextuales con Salamandra

### Tablas DynamoDB

- **UsersTable**: PK: userId
- **RoomsTable**: PK: roomId
- **RoomMembersTable**: PK: roomId, SK: userId + GSI UserHistoryIndex
- **VotesTable**: PK: roomId, SK: movieId
- **MoviesCacheTable**: PK: tmdbId + TTL (30 días)

## Requisitos Previos

1. **AWS CLI** configurado con credenciales
2. **Node.js** 18+ y npm
3. **AWS CDK** instalado globalmente:
   ```bash
   npm install -g aws-cdk
   ```

## Variables de Entorno

Crear archivo `.env` en el directorio `infrastructure/`:

```bash
# API Keys
TMDB_API_KEY=tu_api_key_de_tmdb
HF_API_TOKEN=tu_token_de_hugging_face

# Configuración AWS (opcional)
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=123456789012
```

## Instalación y Despliegue

### 1. Instalar Dependencias

```bash
cd infrastructure
npm install
```

### 2. Bootstrap CDK (solo primera vez)

```bash
npm run bootstrap
```

### 3. Compilar TypeScript

```bash
npm run build
```

### 4. Verificar Síntesis

```bash
npm run synth
```

### 5. Desplegar Infraestructura

```bash
# Desarrollo
npm run deploy

# Producción
cdk deploy --context stage=prod
```

## Comandos Útiles

```bash
# Compilar y observar cambios
npm run watch

# Ver diferencias antes de desplegar
npm run diff

# Ejecutar tests
npm test

# Destruir infraestructura (¡CUIDADO!)
npm run destroy
```

## Configuración Post-Despliegue

### 1. Obtener Outputs

Después del despliegue, CDK mostrará los outputs importantes:

- `GraphQLApiUrl`: URL de la API GraphQL
- `GraphQLApiId`: ID de la API para configurar el cliente
- `UserPoolId`: ID del User Pool de Cognito
- `Region`: Región de AWS donde se desplegó

### 2. Configurar Cliente Móvil

Usar los outputs para configurar AWS Amplify en la app móvil:

```typescript
const awsconfig = {
  aws_appsync_graphqlEndpoint: 'https://xxxxx.appsync-api.us-east-1.amazonaws.com/graphql',
  aws_appsync_region: 'us-east-1',
  aws_appsync_authenticationType: 'AMAZON_COGNITO_USER_POOLS',
  aws_cognito_region: 'us-east-1',
  aws_user_pools_id: 'us-east-1_xxxxxxxxx',
  aws_user_pools_web_client_id: 'xxxxxxxxxxxxxxxxxxxxxxxxxx',
};
```

## Estructura de Archivos

```
infrastructure/
├── lib/
│   └── trinity-stack.ts          # Stack principal CDK
├── src/
│   └── handlers/                 # Funciones Lambda
│       ├── auth.ts              # Post-confirmation trigger
│       ├── room.ts              # Gestión de salas
│       ├── movie.ts             # Circuit breaker TMDB
│       ├── vote.ts              # Algoritmo Stop-on-Match
│       └── ai.ts                # IA Salamandra
├── schema.graphql               # Schema GraphQL simplificado
├── package.json                 # Dependencias
├── cdk.json                     # Configuración CDK
└── tsconfig.json               # Configuración TypeScript
```

## Optimizaciones Free Tier

- **DynamoDB**: Pay-per-request (sin capacidad reservada)
- **Lambda**: Memoria optimizada (256-512 MB)
- **AppSync**: Sin X-Ray habilitado
- **Cognito**: Configuración básica sin features premium
- **CloudWatch**: Logs con retención por defecto

## Monitoreo y Logs

### CloudWatch Logs

Cada función Lambda genera logs automáticamente:

- `/aws/lambda/trinity-auth-{stage}`
- `/aws/lambda/trinity-room-{stage}`
- `/aws/lambda/trinity-movie-{stage}`
- `/aws/lambda/trinity-vote-{stage}`
- `/aws/lambda/trinity-ai-{stage}`

### Métricas AppSync

- Latencia de resolvers
- Errores de autenticación
- Throughput de requests

## Troubleshooting

### Error: "Cannot assume role"

```bash
aws sts get-caller-identity
aws configure list
```

### Error: "Stack already exists"

```bash
cdk destroy
cdk deploy
```

### Error: "Lambda timeout"

Aumentar timeout en `trinity-stack.ts`:

```typescript
timeout: cdk.Duration.seconds(60)
```

### Error: "DynamoDB throttling"

Las tablas usan pay-per-request, pero si hay throttling:

```typescript
billingMode: dynamodb.BillingMode.PROVISIONED,
readCapacity: 5,
writeCapacity: 5,
```

## Seguridad

### Permisos IAM

- **Principio de menor privilegio**: Cada Lambda solo tiene permisos específicos
- **No wildcards**: Permisos granulares por tabla
- **Separación de responsabilidades**: Cada handler maneja su dominio

### Autenticación

- **Cognito User Pools**: Autenticación principal
- **API Key**: Solo para desarrollo/testing
- **JWT Tokens**: Validación automática en AppSync

### Datos Sensibles

- **Variables de entorno**: API keys encriptadas
- **Secrets Manager**: Para tokens de producción (recomendado)
- **VPC**: No necesario para este MVP (serverless)

## Costos Estimados (Free Tier)

- **Lambda**: ~1M invocaciones/mes gratis
- **DynamoDB**: 25 GB almacenamiento + 25 RCU/WCU gratis
- **AppSync**: 250K requests/mes gratis
- **Cognito**: 50K MAU gratis

**Costo estimado mensual**: $0-5 USD (dentro del Free Tier)

## Próximos Pasos

1. **CI/CD**: Configurar GitHub Actions para despliegue automático
2. **Monitoring**: Implementar CloudWatch Dashboards
3. **Testing**: Añadir tests de integración
4. **Performance**: Optimizar cold starts de Lambda
5. **Scaling**: Configurar auto-scaling para producción