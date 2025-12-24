# 💰 Trinity Cost Optimization System

## Resumen

El sistema de optimización de costos de Trinity proporciona monitoreo automático, alertas inteligentes y optimizaciones proactivas para mantener los costos de AWS bajo control mientras se mantiene el rendimiento óptimo.

## 🎯 Características Principales

### 1. Monitoreo en Tiempo Real
- **Métricas de costos**: Seguimiento continuo de gastos estimados
- **Uso de recursos**: Monitoreo de Lambda invocations, DynamoDB RCU/WCU
- **Alertas automáticas**: Notificaciones cuando se exceden umbrales

### 2. Presupuesto Inteligente
- **Límites configurables**: Presupuesto mensual personalizable
- **Alertas escalonadas**: 50%, 80%, 100% del presupuesto
- **Proyecciones**: Estimaciones de gasto basadas en tendencias

### 3. Auto-Escalado
- **Cron jobs automáticos**: Verificaciones cada hora, reportes diarios
- **Optimizaciones automáticas**: Aplicación de mejores prácticas sin intervención
- **Limpieza programada**: Mantenimiento semanal automático

### 4. Recomendaciones Inteligentes
- **Análisis de patrones**: Identificación de oportunidades de ahorro
- **Priorización**: Recomendaciones ordenadas por potencial de ahorro
- **Acciones específicas**: Pasos concretos para implementar optimizaciones

## 🚀 Endpoints Disponibles

### Métricas de Costos
```http
GET /cost-optimization/metrics
```
Retorna métricas actuales de costos y uso de recursos.

**Respuesta:**
```json
{
  "estimatedMonthlyCost": 25.50,
  "lambdaInvocations": 1250,
  "dynamoReadUnits": 850,
  "dynamoWriteUnits": 320,
  "lastUpdated": "2025-12-24T10:30:00Z"
}
```

### Recomendaciones de Optimización
```http
GET /cost-optimization/recommendations
```
Genera recomendaciones personalizadas basadas en el uso actual.

**Respuesta:**
```json
[
  {
    "type": "lambda",
    "severity": "high",
    "title": "Invocaciones Lambda excesivas",
    "description": "Se detectaron 15000 invocaciones en las últimas 24h",
    "potentialSavings": 12.50,
    "actionRequired": "Implementar caché en endpoints frecuentes"
  }
]
```

### Estado del Presupuesto
```http
GET /cost-optimization/budget
```
Retorna el estado actual del presupuesto mensual.

**Respuesta:**
```json
{
  "budgetName": "trinity-monthly-budget-dev",
  "budgetLimit": 50.00,
  "actualSpend": 23.45,
  "forecastedSpend": 45.20,
  "percentageUsed": 46.9,
  "daysRemaining": 12
}
```

### Optimizaciones Automáticas
```http
POST /cost-optimization/optimize/auto
```
Ejecuta optimizaciones automáticas seguras.

**Respuesta:**
```json
{
  "appliedOptimizations": [
    "Configurada retención de logs a 7 días para desarrollo",
    "Configurada reserved concurrency de 10 para funciones Lambda",
    "Limpiados elementos de caché expirados en DynamoDB"
  ],
  "totalOptimizations": 3,
  "estimatedSavings": 8.50
}
```

### Health Check
```http
GET /cost-optimization/health
```
Verifica el estado de los servicios de monitoreo.

### Dashboard URL
```http
GET /cost-optimization/dashboard-url
```
Retorna la URL del dashboard de CloudWatch.

## 🔧 Configuración

### Variables de Entorno

```bash
# Configuración de presupuesto
MONTHLY_BUDGET_LIMIT=50
ALERT_EMAIL=admin@trinity.com

# Configuración de monitoreo
COST_MONITORING_ENABLED=true
AUTO_SCALING_ENABLED=true

# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=your-aws-account-id
STAGE=dev
```

### Infraestructura AWS

El sistema despliega automáticamente:

1. **CloudWatch Alarms**: Para Lambda y DynamoDB
2. **SNS Topics**: Para notificaciones por email
3. **Budget Alerts**: Con múltiples umbrales
4. **Dashboard**: Visualización de métricas
5. **Log Retention**: Políticas optimizadas

## 📊 Auto-Escalado

### Cron Jobs Automáticos

#### Verificación Horaria
- **Frecuencia**: Cada hora
- **Función**: Monitoreo de métricas y aplicación de optimizaciones automáticas
- **Criterios**: Invocaciones > 5000/h, RCU > 500/h, WCU > 250/h

#### Reporte Diario
- **Frecuencia**: 9:00 AM todos los días
- **Función**: Reporte completo de costos y recomendaciones
- **Contenido**: Métricas, presupuesto, top 3 recomendaciones

#### Alertas Críticas
- **Frecuencia**: Cada 15 minutos
- **Función**: Detección de picos de costo o uso excesivo
- **Umbrales**: Presupuesto > 90%, invocaciones > 10000/24h

#### Mantenimiento Semanal
- **Frecuencia**: Domingos a las 2:00 AM
- **Función**: Limpieza completa y optimizaciones
- **Acciones**: Limpieza de logs, caché, configuración de concurrencia

## 🎯 Optimizaciones Automáticas

### Lambda Functions
- **Reserved Concurrency**: Límite de 10 ejecuciones concurrentes
- **Memory Optimization**: Análisis de uso real vs asignado
- **Timeout Monitoring**: Alertas por funciones que se acercan al timeout

### DynamoDB
- **Capacity Monitoring**: Seguimiento de RCU/WCU consumidas
- **Cache Cleanup**: Limpieza automática de elementos expirados
- **Throttling Alerts**: Notificaciones por throttling

### General
- **Log Retention**: 7 días para dev, 30 días para prod
- **Resource Tagging**: Etiquetado automático para seguimiento
- **Cost Allocation**: Distribución de costos por servicio

## 📈 Métricas y Alertas

### Umbrales de Alerta

| Métrica | Umbral Bajo | Umbral Medio | Umbral Alto |
|---------|-------------|--------------|-------------|
| Presupuesto | 50% | 80% | 90% |
| Lambda Invocations/24h | 5,000 | 10,000 | 20,000 |
| DynamoDB RCU/24h | 500 | 1,000 | 2,000 |
| DynamoDB WCU/24h | 250 | 500 | 1,000 |
| Costo Mensual | $25 | $50 | $100 |

### Dashboard CloudWatch

El dashboard incluye:
- **Costos estimados**: Tendencia mensual
- **Invocaciones Lambda**: Por función y total
- **DynamoDB Usage**: RCU/WCU por tabla
- **Error Rates**: Errores por servicio
- **Performance**: Latencia y duración

## 🔍 Troubleshooting

### Problemas Comunes

#### 1. Alertas No Recibidas
```bash
# Verificar configuración SNS
aws sns list-subscriptions --region us-east-1

# Verificar email confirmado
aws sns get-subscription-attributes --subscription-arn <arn>
```

#### 2. Métricas No Disponibles
```bash
# Verificar permisos CloudWatch
aws iam get-role-policy --role-name trinity-lambda-role --policy-name CloudWatchPolicy

# Verificar métricas
aws cloudwatch list-metrics --namespace AWS/Lambda
```

#### 3. Presupuesto No Configurado
```bash
# Verificar presupuestos
aws budgets describe-budgets --account-id <account-id>

# Crear presupuesto manualmente si es necesario
aws budgets create-budget --account-id <account-id> --budget file://budget.json
```

### Logs de Debugging

```bash
# Ver logs del servicio de optimización
kubectl logs -f deployment/trinity-backend | grep "CostOptimization"

# Ver logs de auto-escalado
kubectl logs -f deployment/trinity-backend | grep "AutoScaling"

# Ver métricas en tiempo real
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --start-time 2025-12-24T00:00:00Z \
  --end-time 2025-12-24T23:59:59Z \
  --period 3600 \
  --statistics Sum
```

## 🚀 Despliegue

### 1. Instalar Dependencias
```bash
cd backend
npm install --legacy-peer-deps
```

### 2. Configurar Variables de Entorno
```bash
cp .env.example .env
# Editar .env con tus valores
```

### 3. Desplegar Infraestructura
```bash
cd infrastructure
npm install
npx cdk deploy TrinityOptimizationStack
```

### 4. Verificar Despliegue
```bash
# Verificar endpoints
curl -H "Authorization: Bearer <token>" \
  http://localhost:3000/cost-optimization/health

# Verificar dashboard
aws cloudwatch describe-dashboards --region us-east-1
```

## 📚 Recursos Adicionales

- [AWS Cost Management Best Practices](https://docs.aws.amazon.com/cost-management/)
- [CloudWatch Pricing](https://aws.amazon.com/cloudwatch/pricing/)
- [DynamoDB Pricing](https://aws.amazon.com/dynamodb/pricing/)
- [Lambda Pricing](https://aws.amazon.com/lambda/pricing/)

## 🤝 Contribuir

Para contribuir al sistema de optimización de costos:

1. **Fork** el repositorio
2. **Crear** una rama para tu feature
3. **Implementar** mejoras o nuevas optimizaciones
4. **Agregar tests** para nuevas funcionalidades
5. **Enviar** pull request

### Áreas de Mejora

- **Machine Learning**: Predicción de costos con ML
- **Multi-Region**: Optimización cross-region
- **Reserved Instances**: Recomendaciones automáticas de RI
- **Spot Instances**: Integración con EC2 Spot
- **Cost Allocation Tags**: Mejores prácticas de etiquetado

---

**Última actualización**: 24 de diciembre de 2025  
**Versión**: 1.0.0  
**Mantenedor**: Trinity Development Team