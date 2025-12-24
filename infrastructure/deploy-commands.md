# 🚀 Comandos de Despliegue Trinity MVP

## Paso 1: Configurar Variables de Entorno

```bash
# Configurar cuenta y región AWS
export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export CDK_DEFAULT_REGION=us-east-1

# Configurar claves API (REEMPLAZA CON TUS CLAVES REALES)
export TMDB_API_KEY=tu-api-key-de-tmdb
export HF_API_TOKEN=tu-token-de-hugging-face

# Verificar configuración
echo "Account: $CDK_DEFAULT_ACCOUNT"
echo "Region: $CDK_DEFAULT_REGION"
echo "TMDB Key: ${TMDB_API_KEY:0:10}..." # Solo muestra los primeros 10 caracteres
echo "HF Token: ${HF_API_TOKEN:0:10}..."
```

## Paso 2: Bootstrap CDK (Solo primera vez)

```bash
npx cdk bootstrap
```

## Paso 3: Desplegar Infraestructura

```bash
# Desplegar todo
npx cdk deploy --all --require-approval never
```

## Paso 4: Obtener Outputs

Después del despliegue, CDK mostrará los outputs importantes:

- **GraphQLApiUrl**: URL de tu API GraphQL
- **UserPoolId**: ID del User Pool de Cognito
- **Region**: Región donde se desplegó

## Paso 5: Configurar Backend

Copia estos valores al archivo `.env` del backend:

```bash
cd ../backend
cp .env.example .env
# Editar .env con los valores del despliegue
```

## Comandos Útiles

```bash
# Ver diferencias antes de desplegar
npx cdk diff

# Destruir toda la infraestructura
npx cdk destroy --all

# Ver logs de CloudFormation
aws cloudformation describe-stack-events --stack-name TrinityMvpStack
```

## Solución de Problemas

### Error de Docker
```bash
sudo usermod -aG docker $USER
newgrp docker
docker ps
```

### Error de Permisos AWS
```bash
aws configure
aws sts get-caller-identity
```

### Error de Variables de Entorno
```bash
# Verificar que las variables están configuradas
env | grep -E "(CDK_|TMDB_|HF_)"
```