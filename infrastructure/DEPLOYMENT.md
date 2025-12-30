# Trinity Production Deployment Guide

## 🚀 Overview

This guide covers the complete deployment of Trinity's advanced serverless architecture with all enterprise-grade features:

- ✅ **Circuit Breaker Pattern** for TMDB API resilience
- ✅ **Stop-on-Match Algorithm** with real-time notifications
- ✅ **AI-Powered Recommendations** with Salamandra-7b-instruct
- ✅ **Real-time WebSocket Subscriptions** via AppSync
- ✅ **Comprehensive Monitoring** and metrics
- ✅ **Duplicate Vote Prevention** with atomic operations

## 📋 Prerequisites

### 1. Required Tools
```bash
# Node.js and npm
node --version  # >= 18.x
npm --version   # >= 9.x

# AWS CLI
aws --version   # >= 2.x

# AWS CDK
npm install -g aws-cdk
cdk --version   # >= 2.100.0
```

### 2. AWS Account Setup
- AWS Account with administrative permissions
- AWS CLI configured with credentials
- Sufficient service limits for Lambda, DynamoDB, AppSync

### 3. External API Keys
- **TMDB API Key**: [Get from TMDB](https://www.themoviedb.org/settings/api)
- **Hugging Face Token**: [Get from HuggingFace](https://huggingface.co/settings/tokens)

## 🔧 Configuration

### 1. Environment Variables Setup

Copy the example environment file:
```bash
cp .env.production.example .env.production
```

Edit `.env.production` with your actual values:
```bash
# Required - AWS Configuration
AWS_ACCOUNT_ID=123456789012
AWS_REGION=eu-west-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# Required - External APIs
TMDB_API_KEY=your-tmdb-api-key
HF_API_TOKEN=hf_your-huggingface-token

# Optional - Circuit Breaker Tuning
CIRCUIT_BREAKER_FAILURE_THRESHOLD=5
CIRCUIT_BREAKER_TIMEOUT_MS=60000

# Optional - Deployment Stage
STAGE=prod
```

### 2. Load Environment Variables

**Windows PowerShell:**
```powershell
# Load environment variables
Get-Content .env.production | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$') {
        [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
    }
}
```

**Linux/macOS:**
```bash
# Load environment variables
export $(cat .env.production | xargs)
```

## 🚀 Deployment Methods

### Method 1: Automated Script (Recommended)

**Windows:**
```powershell
# Run the automated deployment script
.\deploy-production.ps1

# With custom stage
.\deploy-production.ps1 -Stage "staging"

# Skip bootstrap if already done
.\deploy-production.ps1 -SkipBootstrap
```

**Linux/macOS:**
```bash
# Make script executable and run
chmod +x deploy-production.sh
./deploy-production.sh
```

### Method 2: Manual Deployment

```bash
# 1. Install dependencies
npm install

# 2. Build TypeScript
npm run build

# 3. Bootstrap CDK (first time only)
cdk bootstrap aws://$AWS_ACCOUNT_ID/$AWS_REGION

# 4. Deploy infrastructure
cdk deploy --context stage=prod --require-approval never
```

## 📊 Deployment Verification

### 1. Check CloudFormation Stack
```bash
aws cloudformation describe-stacks \
  --stack-name TrinityStack \
  --region $AWS_REGION
```

### 2. Verify Lambda Functions
```bash
aws lambda list-functions \
  --region $AWS_REGION \
  --query 'Functions[?starts_with(FunctionName, `trinity-`)].FunctionName'
```

### 3. Check DynamoDB Tables
```bash
aws dynamodb list-tables \
  --region $AWS_REGION \
  --query 'TableNames[?starts_with(@, `trinity-`)]'
```

### 4. Test GraphQL API
```bash
# Get API URL from outputs
GRAPHQL_URL=$(aws cloudformation describe-stacks \
  --stack-name TrinityStack \
  --region $AWS_REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`GraphQLApiUrl`].OutputValue' \
  --output text)

echo "GraphQL API URL: $GRAPHQL_URL"
```

## 🧪 Testing the Deployment

### 1. Test Movie API with Circuit Breaker
```graphql
query GetMovies {
  getMovies(genre: "action") {
    id
    title
    poster
    overview
  }
}
```

### 2. Test AI Recommendations
```graphql
query GetRecommendations {
  getChatRecommendations(text: "I'm feeling sad today") {
    chatResponse
    recommendedGenres
  }
}
```

### 3. Test Room Creation and Voting
```graphql
mutation CreateRoom {
  createRoom {
    id
    status
    hostId
  }
}

mutation JoinRoom {
  joinRoom(roomId: "room-id-here") {
    id
    status
  }
}

mutation Vote {
  vote(roomId: "room-id-here", movieId: "movie-id-here") {
    id
    status
    resultMovieId
  }
}
```

### 4. Test Real-time Subscriptions
```graphql
subscription OnMatchFound {
  onMatchFound(roomId: "room-id-here") {
    id
    timestamp
    mediaTitle
    participants
  }
}

subscription OnVoteUpdate {
  onVoteUpdate(roomId: "room-id-here") {
    id
    progress {
      totalVotes
      percentage
      remainingUsers
    }
  }
}
```

## 📈 Monitoring and Observability

### 1. CloudWatch Dashboards
- Lambda function metrics
- DynamoDB performance
- Circuit Breaker state changes
- Business metrics (rooms created, votes cast, matches found)

### 2. Key Metrics to Monitor
```bash
# Circuit Breaker State
aws logs filter-log-events \
  --log-group-name "/aws/lambda/trinity-movie-prod" \
  --filter-pattern "METRIC CircuitBreaker"

# Business Events
aws logs filter-log-events \
  --log-group-name "/aws/lambda/trinity-vote-prod" \
  --filter-pattern "BUSINESS"

# Performance Metrics
aws logs filter-log-events \
  --log-group-name "/aws/lambda/trinity-room-prod" \
  --filter-pattern "PERFORMANCE"
```

### 3. Set Up Alarms
```bash
# Circuit Breaker Open Alarm
aws cloudwatch put-metric-alarm \
  --alarm-name "Trinity-CircuitBreaker-Open" \
  --alarm-description "Circuit breaker is open" \
  --metric-name "CircuitBreaker_State" \
  --namespace "Trinity/CircuitBreaker" \
  --statistic "Maximum" \
  --period 300 \
  --threshold 1 \
  --comparison-operator "GreaterThanOrEqualToThreshold"
```

## 🔧 Troubleshooting

### Common Issues

#### 1. CDK Bootstrap Errors
```bash
# Error: "CDK bootstrap required"
# Solution: Run bootstrap command
cdk bootstrap aws://$AWS_ACCOUNT_ID/$AWS_REGION
```

#### 2. Permission Errors
```bash
# Error: "User is not authorized to perform..."
# Solution: Ensure AWS credentials have sufficient permissions
aws sts get-caller-identity
```

#### 3. Environment Variable Issues
```bash
# Error: "TMDB_API_KEY not configured"
# Solution: Verify environment variables are loaded
echo $TMDB_API_KEY
```

#### 4. Circuit Breaker Always Open
```bash
# Check TMDB API connectivity
curl "https://api.themoviedb.org/3/movie/popular?api_key=$TMDB_API_KEY"
```

### Debug Commands

```bash
# Check Lambda logs
aws logs describe-log-groups \
  --log-group-name-prefix "/aws/lambda/trinity"

# Tail specific function logs
aws logs tail "/aws/lambda/trinity-movie-prod" --follow

# Check DynamoDB table status
aws dynamodb describe-table \
  --table-name "trinity-rooms-prod"
```

## 🔄 Updates and Maintenance

### 1. Update Deployment
```bash
# Pull latest changes
git pull origin main

# Rebuild and redeploy
npm run build
cdk deploy --context stage=prod
```

### 2. Rollback Deployment
```bash
# Rollback to previous version
cdk deploy --context stage=prod --rollback
```

### 3. Clean Up Resources
```bash
# Destroy all resources (CAUTION!)
cdk destroy --context stage=prod
```

## 💰 Cost Optimization

### Expected Costs (Free Tier)
- **Lambda**: 1M requests/month free
- **DynamoDB**: 25GB + 25 RCU/WCU free
- **AppSync**: 250K queries/month free
- **CloudWatch**: Basic metrics included

### Cost Monitoring
```bash
# Set up budget alerts
aws budgets create-budget \
  --account-id $AWS_ACCOUNT_ID \
  --budget file://budget.json
```

## 🔐 Security Considerations

### 1. API Keys Security
- Store API keys in AWS Secrets Manager (production)
- Rotate keys regularly
- Monitor API usage

### 2. Access Control
- Use least-privilege IAM roles
- Enable CloudTrail for audit logging
- Configure VPC endpoints if needed

### 3. Data Protection
- Enable DynamoDB encryption at rest
- Use HTTPS for all API calls
- Implement rate limiting

## 📞 Support

### Getting Help
1. Check CloudWatch logs for errors
2. Review this deployment guide
3. Check AWS service health dashboard
4. Contact development team

### Useful Resources
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [AppSync Documentation](https://docs.aws.amazon.com/appsync/)
- [DynamoDB Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)
- [Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)

---

**🎉 Congratulations! Trinity is now deployed with enterprise-grade architecture and ready for production use.**