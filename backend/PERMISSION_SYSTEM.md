# Sistema de Permisos Avanzado - Trinity MVP

## Resumen

El sistema de permisos avanzado de Trinity proporciona control granular de acceso a las funcionalidades de las salas, con caché inteligente, auditoría completa y resolución automática de conflictos.

## Arquitectura

### Componentes Principales

1. **PermissionGuard**: Guard de NestJS que intercepta requests y verifica permisos
2. **PermissionService**: Servicio principal con caché, verificación en lote y resolución de conflictos
3. **PermissionAuditMiddleware**: Middleware que registra todos los accesos para auditoría
4. **Decoradores de Permisos**: Decoradores para especificar permisos requeridos en endpoints

### Flujo de Verificación de Permisos

```
Request → PermissionGuard → PermissionService → RoomModerationService → DynamoDB
                ↓
        PermissionAuditMiddleware → Audit Log
```

## Permisos Disponibles

### Permisos Básicos
- `VIEW_ROOM`: Ver contenido de la sala
- `VOTE`: Votar en contenido
- `CHAT`: Enviar mensajes en chat
- `REACT`: Reaccionar a contenido

### Permisos de Contenido
- `SUGGEST_CONTENT`: Sugerir contenido
- `INJECT_CONTENT`: Inyectar contenido directamente
- `REMOVE_CONTENT`: Remover contenido

### Permisos de Gestión
- `INVITE_MEMBERS`: Invitar nuevos miembros
- `REMOVE_MEMBERS`: Remover miembros
- `MANAGE_ROLES`: Gestionar roles personalizados
- `MODIFY_SETTINGS`: Modificar configuración de sala

### Permisos de Moderación
- `MUTE_MEMBERS`: Silenciar miembros
- `WARN_MEMBERS`: Advertir miembros
- `BAN_MEMBERS`: Banear miembros
- `VIEW_MODERATION_LOG`: Ver historial de moderación

### Permisos Administrativos
- `DELETE_ROOM`: Eliminar sala
- `TRANSFER_OWNERSHIP`: Transferir propiedad
- `MANAGE_TEMPLATES`: Gestionar plantillas
- `MANAGE_THEMES`: Gestionar temas
- `MANAGE_SCHEDULES`: Gestionar programación
- `VIEW_ANALYTICS`: Ver analíticas
- `EXPORT_DATA`: Exportar datos
- `MANAGE_INTEGRATIONS`: Gestionar integraciones
- `VIEW_AUDIT_LOG`: Ver registro de auditoría

## Roles del Sistema

### Jerarquía de Roles (por prioridad)

1. **Owner (100)**: Todos los permisos
2. **Admin (80)**: Todos excepto eliminar sala y transferir propiedad
3. **Moderator (60)**: Permisos de moderación y contenido
4. **Member (40)**: Permisos básicos de participación
5. **Guest (20)**: Solo visualización y votación

## Uso de Decoradores

### Decoradores Básicos

```typescript
import { RequirePermissions, RequireOwner, RequireAdmin, RequireModerator, RequireMember } from '../../common/decorators/permissions.decorator';

// Permiso específico
@RequirePermissions(RoomPermission.MANAGE_ROLES)
@UseGuards(PermissionGuard)
async manageRoles() { ... }

// Permisos múltiples
@RequirePermissions(RoomPermission.MUTE_MEMBERS, RoomPermission.WARN_MEMBERS)
@UseGuards(PermissionGuard)
async moderateUser() { ... }

// Decoradores de conveniencia
@RequireOwner()
@UseGuards(PermissionGuard)
async deleteRoom() { ... }

@RequireAdmin()
@UseGuards(PermissionGuard)
async adminAction() { ... }

@RequireModerator()
@UseGuards(PermissionGuard)
async moderateContent() { ... }

@RequireMember()
@UseGuards(PermissionGuard)
async participateInRoom() { ... }
```

## API de Permisos

### Endpoints Principales

#### Verificar Permisos
```http
POST /permissions/check
Content-Type: application/json

{
  "roomId": "room123",
  "permissions": ["view_room", "vote"],
  "useCache": true
}
```

#### Verificación en Lote
```http
POST /permissions/bulk-check
Content-Type: application/json

{
  "checks": [
    {
      "userId": "user1",
      "roomId": "room1",
      "permissions": ["manage_roles"]
    }
  ]
}
```

#### Resumen de Permisos
```http
GET /permissions/summary/room123
```

#### Detectar Conflictos
```http
GET /permissions/conflicts/room123
```

#### Resolver Conflictos
```http
POST /permissions/resolve-conflicts
Content-Type: application/json

{
  "roomId": "room123",
  "userId": "user456"
}
```

#### Gestión de Caché
```http
POST /permissions/cache/invalidate/room123?userId=user456
GET /permissions/cache/stats
```

## Sistema de Caché

### Características
- **TTL**: 5 minutos por defecto
- **Invalidación**: Automática por TTL o manual
- **Estadísticas**: Hit rate, tamaño, entradas activas
- **Scope**: Por usuario y sala

### Uso del Caché

```typescript
// Con caché (recomendado para verificaciones frecuentes)
const results = await permissionService.checkPermissions(
  roomId, 
  userId, 
  permissions, 
  { useCache: true }
);

// Sin caché (para verificaciones críticas)
const results = await permissionService.checkPermissions(
  roomId, 
  userId, 
  permissions, 
  { useCache: false }
);
```

## Auditoría de Permisos

### Información Registrada
- Usuario y sala involucrados
- Endpoint accedido
- Método HTTP
- Timestamp
- Éxito/fallo del acceso
- Tiempo de respuesta
- IP y User-Agent

### Consulta de Auditoría

Los logs se almacenan en DynamoDB con las siguientes claves:
- **PK**: `AUDIT#{userId}`
- **SK**: `ACCESS#{timestamp}#{auditId}`
- **GSI1PK**: `ROOM_AUDIT#{roomId}`
- **GSI1SK**: `ACCESS#{timestamp}`

## Detección y Resolución de Conflictos

### Tipos de Conflictos

1. **Jerarquía**: Usuario con roles de muy diferente prioridad (ej: Owner + Guest)
2. **Contradictorios**: Permisos que se contradicen entre sí
3. **Herencia**: Conflictos en herencia de permisos (futuro)

### Resolución Automática

```typescript
const result = await permissionService.resolvePermissionConflicts(
  roomId, 
  userId, 
  moderatorId
);

console.log(`Conflictos resueltos: ${result.resolved}`);
console.log(`Conflictos restantes: ${result.remaining.length}`);
```

## Integración con Controladores Existentes

### Antes (Guards básicos)
```typescript
@UseGuards(RoomCreatorGuard)
async updateRoom() { ... }
```

### Después (Sistema de permisos)
```typescript
@RequirePermissions(RoomPermission.MODIFY_SETTINGS)
@UseGuards(PermissionGuard)
async updateRoom() { ... }
```

## Property-Based Tests

### Cobertura de Tests
- ✅ Verificación de permisos con caché (50 iteraciones)
- ✅ Detección de conflictos de jerarquía (30 iteraciones)
- ✅ Verificación en lote (30 iteraciones)
- ✅ Consistencia de caché (50 iteraciones)
- ✅ Generación de resúmenes (50 iteraciones)
- ✅ Resolución automática de conflictos (30 iteraciones)
- ✅ Manejo de TTL de caché (30 iteraciones)

### Ejecutar Tests
```bash
npx jest permission.service.spec.ts --verbose
```

## Rendimiento

### Optimizaciones Implementadas
- **Caché en memoria**: Reduce llamadas a DynamoDB
- **Verificación en lote**: Optimiza múltiples verificaciones
- **Invalidación selectiva**: Solo invalida caché necesario
- **Auditoría asíncrona**: No bloquea requests principales

### Métricas Esperadas
- **Tiempo de verificación**: < 10ms (con caché)
- **Hit rate de caché**: > 80%
- **Overhead de auditoría**: < 5ms

## Configuración

### Variables de Entorno
```env
# TTL del caché de permisos (en milisegundos)
PERMISSION_CACHE_TTL=300000

# Habilitar auditoría de permisos
PERMISSION_AUDIT_ENABLED=true

# Nivel de log para permisos
PERMISSION_LOG_LEVEL=debug
```

### Configuración en Código
```typescript
// En PermissionService
private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutos

// En PermissionAuditMiddleware
private shouldAudit(path: string): boolean {
  const auditPaths = ['/rooms', '/room-moderation', '/room-themes'];
  return auditPaths.some(auditPath => path.includes(auditPath));
}
```

## Migración desde Sistema Anterior

### Pasos de Migración

1. **Actualizar imports**: Cambiar guards antiguos por PermissionGuard
2. **Agregar decoradores**: Usar @RequirePermissions en endpoints
3. **Actualizar user.id**: Cambiar por user.sub (JWT estándar)
4. **Configurar middleware**: Agregar PermissionAuditMiddleware
5. **Ejecutar tests**: Verificar que todo funciona correctamente

### Compatibilidad

El sistema es **backward compatible** con el RoomModerationService existente. Los guards antiguos pueden coexistir durante la migración.

## Monitoreo y Debugging

### Logs Importantes
```
[PermissionGuard] Permisos verificados para usuario user123 en sala room456: manage_roles
[PermissionService] Caché de permisos invalidado para sala room123
[PermissionAuditMiddleware] Acceso denegado auditado: user123 -> /rooms/456/settings
```

### Métricas de Caché
```typescript
const stats = permissionService.getPermissionCacheStats();
console.log(`Tamaño del caché: ${stats.size}`);
console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(2)}%`);
```

## Próximas Mejoras

### Funcionalidades Futuras
- **Herencia de permisos**: Desde grupos u organizaciones
- **Permisos temporales**: Con expiración automática
- **Permisos condicionales**: Basados en contexto
- **Dashboard de permisos**: UI para gestión visual
- **Alertas de seguridad**: Notificaciones de accesos sospechosos

### Optimizaciones Planeadas
- **Caché distribuido**: Redis para múltiples instancias
- **Compresión de auditoría**: Reducir tamaño de logs
- **Índices optimizados**: Mejorar consultas de auditoría
- **Batch processing**: Procesar auditoría en lotes

---

**Implementado en**: Tarea 8 - Permission System Implementation  
**Estado**: ✅ Completado  
**Tests**: 7 suites de property tests con 50+ iteraciones cada uno  
**Cobertura**: Sistema completo con caché, auditoría y resolución de conflictos