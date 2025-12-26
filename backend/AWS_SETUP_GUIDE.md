# Guía de Configuración AWS para Trinity

Esta guía te ayudará a configurar las credenciales y servicios AWS necesarios para que Trinity funcione correctamente.

## 🔧 Configuración de Credenciales AWS

### Opción 1: Variables de Entorno (Recomendado para desarrollo)

1. **Obtener credenciales AWS:**
   - Ve a la consola AWS → IAM → Users
   - Crea un nuevo usuario o usa uno existente
   - Genera Access Keys (Access Key ID + Secret Access Key)

2. **Configurar el archivo `.env`:**
   ```bash
   # Reemplaza estos valores con tus credenciales reales
   AWS_ACCESS_KEY_ID=AKIA...
   AWS_SECRET_ACCESS_KEY=...
   AWS_REGION=eu-west-1
   AWS_ACCOUNT_ID=123456789012
   ```

### Opción 2: AWS CLI (Alternativa)

```bash
# Instalar AWS CLI
npm install -g @aws-cli/cli

# Configurar credenciales
aws configure
```

## 🛠️ Servicios AWS Requeridos

### 1. DynamoDB
- **Tabla principal:** `trinity-main` (o el nombre en `DYNAMODB_TABLE_NAME`)
- **Permisos necesarios:**
  - `dynamodb:ListTables`
  - `dynamodb:DescribeTable`
  - `dynamodb:GetItem`
  - `dynamodb:PutItem`
  - `dynamodb:UpdateItem`
  - `dynamodb:DeleteItem`
  - `dynamodb:Query`
  - `dynamodb:Scan`

### 2. Cognito
- **User Pool:** Crear un User Pool para autenticación
- **Configurar en `.env`:**
  ```bash
  COGNITO_USER_POOL_ID=eu-west-1_XXXXXXXXX
  COGNITO_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXX
  COGNITO_REGION=eu-west-1
  ```

### 3. S3 (Opcional)
- **Bucket:** Para almacenamiento de archivos
- **Permisos necesarios:**
  - `s3:ListBucket`
  - `s3:GetObject`
  - `s3:PutObject`
  - `s3:DeleteObject`

### 4. CloudWatch (Para métricas)
- **Permisos necesarios:**
  - `cloudwatch:ListMetrics`
  - `cloudwatch:GetMetricStatistics`

## 🔍 Verificación de Conectividad

### Método 1: Script de verificación
```bash
npm run aws:check
```

### Método 2: Endpoint de health check
1. Iniciar el servidor:
   ```bash
   npm run start:dev
   ```

2. Verificar conectividad:
   ```bash
   # Verificación completa
   curl http://localhost:3000/health/aws

   # Servicios individuales
   curl http://localhost:3000/health/aws/dynamodb
   curl http://localhost:3000/health/aws/cognito
   curl http://localhost:3000/health/aws/s3
   curl http://localhost:3000/health/aws/credentials
   ```

### Método 3: Con npm script (requiere jq)
```bash
npm run aws:health
```

## 🚨 Solución de Problemas Comunes

### Error: "The security token included in the request is invalid"
- **Causa:** Credenciales incorrectas o expiradas
- **Solución:** Verificar y regenerar las credenciales AWS

### Error: "The AWS Access Key Id you provided does not exist"
- **Causa:** Access Key ID incorrecto
- **Solución:** Verificar el Access Key ID en la consola AWS

### Error: "User Pool not found"
- **Causa:** User Pool ID incorrecto o no existe
- **Solución:** Crear un User Pool en Cognito y actualizar la configuración

### Error: "Table not found"
- **Causa:** La tabla DynamoDB no existe
- **Solución:** Crear la tabla usando CDK o manualmente en la consola

## 📋 Política IAM Recomendada

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "dynamodb:ListTables",
                "dynamodb:DescribeTable",
                "dynamodb:GetItem",
                "dynamodb:PutItem",
                "dynamodb:UpdateItem",
                "dynamodb:DeleteItem",
                "dynamodb:Query",
                "dynamodb:Scan"
            ],
            "Resource": "*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "cognito-idp:DescribeUserPool",
                "cognito-idp:ListUserPools",
                "cognito-idp:AdminCreateUser",
                "cognito-idp:AdminDeleteUser"
            ],
            "Resource": "*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3:ListBucket",
                "s3:GetObject",
                "s3:PutObject",
                "s3:DeleteObject"
            ],
            "Resource": "*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "cloudwatch:ListMetrics",
                "cloudwatch:GetMetricStatistics"
            ],
            "Resource": "*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "sts:GetCallerIdentity"
            ],
            "Resource": "*"
        }
    ]
}
```

## 🎯 Próximos Pasos

1. **Configurar credenciales** siguiendo la Opción 1 o 2
2. **Ejecutar verificación:** `npm run aws:check`
3. **Crear recursos AWS** necesarios (DynamoDB, Cognito, etc.)
4. **Verificar conectividad** hasta que todos los servicios estén en verde
5. **Iniciar el servidor:** `npm run start:dev`

## 📞 Soporte

Si encuentras problemas:
1. Ejecuta `npm run aws:check` para diagnóstico
2. Revisa los logs del servidor
3. Verifica los permisos IAM
4. Consulta la documentación AWS oficial