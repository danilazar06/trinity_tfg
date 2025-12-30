# Google Sign-In Setup Script for Trinity
# This script helps configure Google Sign-In with AWS Cognito

param(
    [Parameter(Mandatory=$true)]
    [string]$GoogleWebClientId,
    
    [Parameter(Mandatory=$true)]
    [string]$GoogleWebClientSecret,
    
    [Parameter(Mandatory=$false)]
    [string]$GoogleIosClientId = "",
    
    [Parameter(Mandatory=$false)]
    [string]$GoogleAndroidClientId = "",
    
    [Parameter(Mandatory=$false)]
    [string]$Stage = "dev"
)

Write-Host "🚀 Setting up Google Sign-In for Trinity Mobile App" -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Green

# Check if required tools are installed
Write-Host "📋 Checking prerequisites..." -ForegroundColor Yellow

if (!(Get-Command "aws" -ErrorAction SilentlyContinue)) {
    Write-Error "AWS CLI not found. Please install AWS CLI first."
    exit 1
}

if (!(Get-Command "npm" -ErrorAction SilentlyContinue)) {
    Write-Error "npm not found. Please install Node.js first."
    exit 1
}

# Update .env file
Write-Host "📝 Updating environment variables..." -ForegroundColor Yellow

$envFile = "../.env"
if (Test-Path $envFile) {
    $envContent = Get-Content $envFile
    
    # Update or add Google credentials
    $envContent = $envContent | ForEach-Object {
        if ($_ -match "^GOOGLE_CLIENT_ID=") {
            "GOOGLE_CLIENT_ID=$GoogleWebClientId"
        } elseif ($_ -match "^GOOGLE_CLIENT_SECRET=") {
            "GOOGLE_CLIENT_SECRET=$GoogleWebClientSecret"
        } else {
            $_
        }
    }
    
    # Add if not exists
    if (!($envContent -match "^GOOGLE_CLIENT_ID=")) {
        $envContent += "GOOGLE_CLIENT_ID=$GoogleWebClientId"
    }
    if (!($envContent -match "^GOOGLE_CLIENT_SECRET=")) {
        $envContent += "GOOGLE_CLIENT_SECRET=$GoogleWebClientSecret"
    }
    
    $envContent | Set-Content $envFile
    Write-Host "✅ Updated .env file" -ForegroundColor Green
} else {
    Write-Error ".env file not found at $envFile"
    exit 1
}

# Update mobile .env file
Write-Host "📱 Updating mobile app configuration..." -ForegroundColor Yellow

$mobileEnvFile = "../mobile/.env"
$mobileEnvContent = @(
    "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=$GoogleWebClientId"
)

if ($GoogleIosClientId) {
    $mobileEnvContent += "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=$GoogleIosClientId"
}

if ($GoogleAndroidClientId) {
    $mobileEnvContent += "EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=$GoogleAndroidClientId"
}

$mobileEnvContent | Set-Content $mobileEnvFile
Write-Host "✅ Created mobile/.env file" -ForegroundColor Green

# Deploy infrastructure
Write-Host "🏗️ Deploying infrastructure with Google Sign-In support..." -ForegroundColor Yellow

try {
    $env:GOOGLE_CLIENT_ID = $GoogleWebClientId
    $env:GOOGLE_CLIENT_SECRET = $GoogleWebClientSecret
    
    npm run deploy
    
    Write-Host "✅ Infrastructure deployed successfully" -ForegroundColor Green
} catch {
    Write-Error "Failed to deploy infrastructure: $_"
    exit 1
}

# Get deployment outputs
Write-Host "📊 Retrieving deployment outputs..." -ForegroundColor Yellow

try {
    $outputs = aws cloudformation describe-stacks --stack-name "TrinityStack-$Stage" --query "Stacks[0].Outputs" --output json | ConvertFrom-Json
    
    $identityPoolId = ($outputs | Where-Object { $_.OutputKey -eq "IdentityPoolId" }).OutputValue
    $userPoolDomain = ($outputs | Where-Object { $_.OutputKey -eq "UserPoolDomain" }).OutputValue
    
    Write-Host "🆔 Identity Pool ID: $identityPoolId" -ForegroundColor Cyan
    Write-Host "🌐 User Pool Domain: $userPoolDomain" -ForegroundColor Cyan
    
    # Update mobile AWS config
    $awsConfigFile = "../mobile/src/config/aws-config.ts"
    if (Test-Path $awsConfigFile) {
        $awsConfigContent = Get-Content $awsConfigFile -Raw
        
        # Update Identity Pool ID
        $awsConfigContent = $awsConfigContent -replace "identityPoolId: 'eu-west-1:YOUR_IDENTITY_POOL_ID'", "identityPoolId: '$identityPoolId'"
        
        # Update User Pool Domain
        $awsConfigContent = $awsConfigContent -replace "userPoolDomain: 'trinity-auth-dev\.auth\.eu-west-1\.amazoncognito\.com'", "userPoolDomain: '$userPoolDomain.auth.eu-west-1.amazoncognito.com'"
        
        $awsConfigContent | Set-Content $awsConfigFile
        Write-Host "✅ Updated mobile AWS configuration" -ForegroundColor Green
    }
    
} catch {
    Write-Warning "Could not retrieve deployment outputs. Please update manually."
}

# Update mobile app.json
Write-Host "📋 Updating mobile app.json..." -ForegroundColor Yellow

$appJsonFile = "../mobile/app.json"
if (Test-Path $appJsonFile) {
    $appJson = Get-Content $appJsonFile | ConvertFrom-Json
    
    $appJson.expo.extra.googleWebClientId = $GoogleWebClientId
    if ($GoogleIosClientId) {
        $appJson.expo.extra.googleIosClientId = $GoogleIosClientId
    }
    if ($GoogleAndroidClientId) {
        $appJson.expo.extra.googleAndroidClientId = $GoogleAndroidClientId
    }
    
    $appJson | ConvertTo-Json -Depth 10 | Set-Content $appJsonFile
    Write-Host "✅ Updated mobile app.json" -ForegroundColor Green
}

# Install mobile dependencies
Write-Host "📦 Installing mobile dependencies..." -ForegroundColor Yellow

try {
    Set-Location "../mobile"
    npm install
    Write-Host "✅ Mobile dependencies installed" -ForegroundColor Green
} catch {
    Write-Warning "Failed to install mobile dependencies. Please run 'npm install' in mobile directory."
} finally {
    Set-Location "../infrastructure"
}

Write-Host ""
Write-Host "🎉 Google Sign-In setup completed!" -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Configure Google Identity Provider in AWS Cognito Console" -ForegroundColor White
Write-Host "   - Go to Cognito User Pool > Sign-in experience > Federated identity provider sign-in" -ForegroundColor Gray
Write-Host "   - Add Google provider with your client ID and secret" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Test the mobile app:" -ForegroundColor White
Write-Host "   cd ../mobile && npm start" -ForegroundColor Gray
Write-Host ""
Write-Host "3. For production builds, update EAS configuration with Google client IDs" -ForegroundColor White
Write-Host ""
Write-Host "📖 See setup-guide.md for detailed instructions" -ForegroundColor Cyan