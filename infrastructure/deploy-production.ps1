# Trinity Production Deployment Script for Windows PowerShell
# Deploys the complete Trinity infrastructure with all refactorizations

param(
    [string]$Stage = "prod",
    [switch]$SkipBootstrap = $false,
    [switch]$Verify = $true
)

# Set error action preference
$ErrorActionPreference = "Stop"

Write-Host "🚀 Starting Trinity Production Deployment..." -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# Function to print colored output
function Write-Status {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Blue
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

# Check if required environment variables are set
function Test-EnvironmentVariables {
    Write-Status "Checking required environment variables..."
    
    $requiredVars = @(
        "TMDB_API_KEY",
        "HF_API_TOKEN",
        "AWS_REGION",
        "AWS_ACCOUNT_ID"
    )
    
    $missingVars = @()
    
    foreach ($var in $requiredVars) {
        if (-not (Get-ChildItem Env: | Where-Object Name -eq $var)) {
            $missingVars += $var
        }
    }
    
    if ($missingVars.Count -gt 0) {
        Write-Error "Missing required environment variables:"
        foreach ($var in $missingVars) {
            Write-Host "  - $var" -ForegroundColor Red
        }
        Write-Host ""
        Write-Host "Please set these variables and try again." -ForegroundColor Yellow
        Write-Host "Example:" -ForegroundColor Yellow
        Write-Host '  $env:TMDB_API_KEY = "your_tmdb_key"' -ForegroundColor Yellow
        Write-Host '  $env:HF_API_TOKEN = "your_huggingface_token"' -ForegroundColor Yellow
        exit 1
    }
    
    Write-Success "All required environment variables are set"
}

# Install dependencies
function Install-Dependencies {
    Write-Status "Installing dependencies..."
    
    if (-not (Test-Path "package.json")) {
        Write-Error "package.json not found. Are you in the infrastructure directory?"
        exit 1
    }
    
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to install dependencies"
        exit 1
    }
    
    Write-Success "Dependencies installed"
}

# Build TypeScript
function Build-TypeScript {
    Write-Status "Building TypeScript..."
    
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Error "TypeScript build failed"
        exit 1
    }
    
    Write-Success "TypeScript build completed"
}

# Bootstrap CDK (if needed)
function Initialize-CDK {
    if ($SkipBootstrap) {
        Write-Status "Skipping CDK bootstrap (--SkipBootstrap flag set)"
        return
    }
    
    Write-Status "Checking CDK bootstrap status..."
    
    # Check if bootstrap is needed
    $bootstrapExists = $false
    try {
        aws cloudformation describe-stacks --stack-name CDKToolkit --region $env:AWS_REGION --output json | Out-Null
        $bootstrapExists = $true
    }
    catch {
        $bootstrapExists = $false
    }
    
    if (-not $bootstrapExists) {
        Write-Warning "CDK not bootstrapped. Bootstrapping now..."
        npx cdk bootstrap "aws://$env:AWS_ACCOUNT_ID/$env:AWS_REGION"
        if ($LASTEXITCODE -ne 0) {
            Write-Error "CDK bootstrap failed"
            exit 1
        }
        Write-Success "CDK bootstrap completed"
    }
    else {
        Write-Success "CDK already bootstrapped"
    }
}

# Deploy infrastructure
function Deploy-Infrastructure {
    Write-Status "Deploying Trinity infrastructure..."
    Write-Status "Deploying to stage: $Stage"
    
    # Deploy with all required environment variables - only main stack
    npx cdk deploy TrinityMvpStack --context stage=$Stage --require-approval never --outputs-file cdk-outputs.json
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Infrastructure deployment failed"
        exit 1
    }
    
    Write-Success "Infrastructure deployment completed"
}

# Verify deployment
function Test-Deployment {
    if (-not $Verify) {
        Write-Status "Skipping deployment verification (--Verify:$false)"
        return
    }
    
    Write-Status "Verifying deployment..."
    
    if (Test-Path "cdk-outputs.json") {
        Write-Success "CDK outputs file created"
        
        # Try to parse outputs if possible
        try {
            $outputs = Get-Content "cdk-outputs.json" | ConvertFrom-Json
            $graphqlUrl = $outputs.TrinityStack.GraphQLApiUrl
            $userPoolId = $outputs.TrinityStack.UserPoolId
            
            if ($graphqlUrl -and $userPoolId) {
                Write-Success "Key resources deployed successfully:"
                Write-Host "  - GraphQL API: $graphqlUrl" -ForegroundColor Green
                Write-Host "  - User Pool ID: $userPoolId" -ForegroundColor Green
            }
            else {
                Write-Warning "Could not extract all expected outputs"
            }
        }
        catch {
            Write-Warning "Could not parse CDK outputs automatically"
            Write-Host "CDK outputs saved to cdk-outputs.json" -ForegroundColor Yellow
        }
    }
    else {
        Write-Warning "CDK outputs file not found"
    }
}

# Display post-deployment instructions
function Show-PostDeploymentInstructions {
    Write-Host ""
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Success "🎉 Trinity Deployment Completed Successfully!"
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "📋 Next Steps:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "1. 📱 Update Mobile App Configuration:" -ForegroundColor White
    Write-Host "   - Copy GraphQL API URL to mobile app config" -ForegroundColor Gray
    Write-Host "   - Update Cognito User Pool ID in mobile app" -ForegroundColor Gray
    Write-Host ""
    Write-Host "2. 🔧 Configure Environment Variables:" -ForegroundColor White
    Write-Host "   - TMDB_API_KEY: ✅ Set" -ForegroundColor Green
    Write-Host "   - HF_API_TOKEN: ✅ Set" -ForegroundColor Green
    Write-Host "   - Circuit Breaker settings: Using defaults" -ForegroundColor Gray
    Write-Host ""
    Write-Host "3. 📊 Monitor Deployment:" -ForegroundColor White
    Write-Host "   - Check CloudWatch logs for Lambda functions" -ForegroundColor Gray
    Write-Host "   - Monitor Circuit Breaker metrics" -ForegroundColor Gray
    Write-Host "   - Verify real-time subscriptions work" -ForegroundColor Gray
    Write-Host ""
    Write-Host "4. 🧪 Test Key Features:" -ForegroundColor White
    Write-Host "   - Create a room" -ForegroundColor Gray
    Write-Host "   - Join room with multiple users" -ForegroundColor Gray
    Write-Host "   - Test voting and Stop-on-Match algorithm" -ForegroundColor Gray
    Write-Host "   - Test Trini AI recommendations" -ForegroundColor Gray
    Write-Host "   - Verify Circuit Breaker with TMDB API" -ForegroundColor Gray
    Write-Host ""
    Write-Host "5. 🚨 Set Up Monitoring:" -ForegroundColor White
    Write-Host "   - Configure CloudWatch alarms" -ForegroundColor Gray
    Write-Host "   - Set up Circuit Breaker state alerts" -ForegroundColor Gray
    Write-Host "   - Monitor business metrics" -ForegroundColor Gray
    Write-Host ""
    
    if (Test-Path "cdk-outputs.json") {
        Write-Host "📄 Deployment outputs saved to: cdk-outputs.json" -ForegroundColor Cyan
    }
    
    Write-Host ""
    Write-Success "Trinity is ready for production! 🚀"
}

# Main deployment flow
function Start-Deployment {
    Write-Host "🎬 Trinity - Advanced Serverless Movie Discovery Platform" -ForegroundColor Magenta
    Write-Host "🏗️  Architecture: Circuit Breaker + Stop-on-Match + Real-time + AI" -ForegroundColor Magenta
    Write-Host ""
    
    try {
        Test-EnvironmentVariables
        Install-Dependencies
        Build-TypeScript
        Initialize-CDK
        Deploy-Infrastructure
        Test-Deployment
        Show-PostDeploymentInstructions
    }
    catch {
        Write-Error "Deployment failed: $($_.Exception.Message)"
        exit 1
    }
}

# Run main function
Start-Deployment