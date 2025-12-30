#!/bin/bash

# Google Sign-In Setup Script for Trinity
# This script helps configure Google Sign-In with AWS Cognito

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
GRAY='\033[0;37m'
NC='\033[0m' # No Color

# Function to print colored output
print_color() {
    printf "${1}${2}${NC}\n"
}

# Function to print error and exit
error_exit() {
    print_color $RED "Error: $1"
    exit 1
}

# Parse command line arguments
GOOGLE_WEB_CLIENT_ID=""
GOOGLE_WEB_CLIENT_SECRET=""
GOOGLE_IOS_CLIENT_ID=""
GOOGLE_ANDROID_CLIENT_ID=""
STAGE="dev"

while [[ $# -gt 0 ]]; do
    case $1 in
        --web-client-id)
            GOOGLE_WEB_CLIENT_ID="$2"
            shift 2
            ;;
        --web-client-secret)
            GOOGLE_WEB_CLIENT_SECRET="$2"
            shift 2
            ;;
        --ios-client-id)
            GOOGLE_IOS_CLIENT_ID="$2"
            shift 2
            ;;
        --android-client-id)
            GOOGLE_ANDROID_CLIENT_ID="$2"
            shift 2
            ;;
        --stage)
            STAGE="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 --web-client-id CLIENT_ID --web-client-secret CLIENT_SECRET [OPTIONS]"
            echo ""
            echo "Required:"
            echo "  --web-client-id         Google Web Client ID"
            echo "  --web-client-secret     Google Web Client Secret"
            echo ""
            echo "Optional:"
            echo "  --ios-client-id         Google iOS Client ID"
            echo "  --android-client-id     Google Android Client ID"
            echo "  --stage                 Deployment stage (default: dev)"
            echo "  -h, --help             Show this help message"
            exit 0
            ;;
        *)
            error_exit "Unknown option $1. Use --help for usage information."
            ;;
    esac
done

# Validate required parameters
if [[ -z "$GOOGLE_WEB_CLIENT_ID" ]]; then
    error_exit "Google Web Client ID is required. Use --web-client-id parameter."
fi

if [[ -z "$GOOGLE_WEB_CLIENT_SECRET" ]]; then
    error_exit "Google Web Client Secret is required. Use --web-client-secret parameter."
fi

print_color $GREEN "🚀 Setting up Google Sign-In for Trinity Mobile App"
print_color $GREEN "================================================="

# Check if required tools are installed
print_color $YELLOW "📋 Checking prerequisites..."

if ! command -v aws &> /dev/null; then
    error_exit "AWS CLI not found. Please install AWS CLI first."
fi

if ! command -v npm &> /dev/null; then
    error_exit "npm not found. Please install Node.js first."
fi

# Update .env file
print_color $YELLOW "📝 Updating environment variables..."

ENV_FILE="../.env"
if [[ -f "$ENV_FILE" ]]; then
    # Create backup
    cp "$ENV_FILE" "${ENV_FILE}.backup"
    
    # Update or add Google credentials
    if grep -q "^GOOGLE_CLIENT_ID=" "$ENV_FILE"; then
        sed -i.tmp "s/^GOOGLE_CLIENT_ID=.*/GOOGLE_CLIENT_ID=$GOOGLE_WEB_CLIENT_ID/" "$ENV_FILE"
        rm "${ENV_FILE}.tmp" 2>/dev/null || true
    else
        echo "GOOGLE_CLIENT_ID=$GOOGLE_WEB_CLIENT_ID" >> "$ENV_FILE"
    fi
    
    if grep -q "^GOOGLE_CLIENT_SECRET=" "$ENV_FILE"; then
        sed -i.tmp "s/^GOOGLE_CLIENT_SECRET=.*/GOOGLE_CLIENT_SECRET=$GOOGLE_WEB_CLIENT_SECRET/" "$ENV_FILE"
        rm "${ENV_FILE}.tmp" 2>/dev/null || true
    else
        echo "GOOGLE_CLIENT_SECRET=$GOOGLE_WEB_CLIENT_SECRET" >> "$ENV_FILE"
    fi
    
    print_color $GREEN "✅ Updated .env file"
else
    error_exit ".env file not found at $ENV_FILE"
fi

# Update mobile .env file
print_color $YELLOW "📱 Updating mobile app configuration..."

MOBILE_ENV_FILE="../mobile/.env"
cat > "$MOBILE_ENV_FILE" << EOF
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=$GOOGLE_WEB_CLIENT_ID
EOF

if [[ -n "$GOOGLE_IOS_CLIENT_ID" ]]; then
    echo "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=$GOOGLE_IOS_CLIENT_ID" >> "$MOBILE_ENV_FILE"
fi

if [[ -n "$GOOGLE_ANDROID_CLIENT_ID" ]]; then
    echo "EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=$GOOGLE_ANDROID_CLIENT_ID" >> "$MOBILE_ENV_FILE"
fi

print_color $GREEN "✅ Created mobile/.env file"

# Deploy infrastructure
print_color $YELLOW "🏗️ Deploying infrastructure with Google Sign-In support..."

export GOOGLE_CLIENT_ID="$GOOGLE_WEB_CLIENT_ID"
export GOOGLE_CLIENT_SECRET="$GOOGLE_WEB_CLIENT_SECRET"

if npm run deploy; then
    print_color $GREEN "✅ Infrastructure deployed successfully"
else
    error_exit "Failed to deploy infrastructure"
fi

# Get deployment outputs
print_color $YELLOW "📊 Retrieving deployment outputs..."

if OUTPUTS=$(aws cloudformation describe-stacks --stack-name "TrinityStack-$STAGE" --query "Stacks[0].Outputs" --output json 2>/dev/null); then
    IDENTITY_POOL_ID=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="IdentityPoolId") | .OutputValue')
    USER_POOL_DOMAIN=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="UserPoolDomain") | .OutputValue')
    
    print_color $CYAN "🆔 Identity Pool ID: $IDENTITY_POOL_ID"
    print_color $CYAN "🌐 User Pool Domain: $USER_POOL_DOMAIN"
    
    # Update mobile AWS config
    AWS_CONFIG_FILE="../mobile/src/config/aws-config.ts"
    if [[ -f "$AWS_CONFIG_FILE" ]]; then
        # Create backup
        cp "$AWS_CONFIG_FILE" "${AWS_CONFIG_FILE}.backup"
        
        # Update Identity Pool ID
        sed -i.tmp "s/identityPoolId: 'eu-west-1:YOUR_IDENTITY_POOL_ID'/identityPoolId: '$IDENTITY_POOL_ID'/" "$AWS_CONFIG_FILE"
        
        # Update User Pool Domain
        sed -i.tmp "s/userPoolDomain: 'trinity-auth-dev\.auth\.eu-west-1\.amazoncognito\.com'/userPoolDomain: '$USER_POOL_DOMAIN.auth.eu-west-1.amazoncognito.com'/" "$AWS_CONFIG_FILE"
        
        rm "${AWS_CONFIG_FILE}.tmp" 2>/dev/null || true
        
        print_color $GREEN "✅ Updated mobile AWS configuration"
    fi
else
    print_color $YELLOW "⚠️  Could not retrieve deployment outputs. Please update manually."
fi

# Update mobile app.json
print_color $YELLOW "📋 Updating mobile app.json..."

APP_JSON_FILE="../mobile/app.json"
if [[ -f "$APP_JSON_FILE" ]]; then
    # Create backup
    cp "$APP_JSON_FILE" "${APP_JSON_FILE}.backup"
    
    # Update app.json using jq
    TEMP_FILE=$(mktemp)
    jq --arg webClientId "$GOOGLE_WEB_CLIENT_ID" \
       --arg iosClientId "$GOOGLE_IOS_CLIENT_ID" \
       --arg androidClientId "$GOOGLE_ANDROID_CLIENT_ID" \
       '.expo.extra.googleWebClientId = $webClientId |
        if $iosClientId != "" then .expo.extra.googleIosClientId = $iosClientId else . end |
        if $androidClientId != "" then .expo.extra.googleAndroidClientId = $androidClientId else . end' \
       "$APP_JSON_FILE" > "$TEMP_FILE"
    
    mv "$TEMP_FILE" "$APP_JSON_FILE"
    print_color $GREEN "✅ Updated mobile app.json"
fi

# Install mobile dependencies
print_color $YELLOW "📦 Installing mobile dependencies..."

if (cd ../mobile && npm install); then
    print_color $GREEN "✅ Mobile dependencies installed"
else
    print_color $YELLOW "⚠️  Failed to install mobile dependencies. Please run 'npm install' in mobile directory."
fi

print_color $GREEN ""
print_color $GREEN "🎉 Google Sign-In setup completed!"
print_color $GREEN "================================================="
print_color $GREEN ""
print_color $YELLOW "Next steps:"
print_color $WHITE "1. Configure Google Identity Provider in AWS Cognito Console"
print_color $GRAY "   - Go to Cognito User Pool > Sign-in experience > Federated identity provider sign-in"
print_color $GRAY "   - Add Google provider with your client ID and secret"
print_color $WHITE ""
print_color $WHITE "2. Test the mobile app:"
print_color $GRAY "   cd ../mobile && npm start"
print_color $WHITE ""
print_color $WHITE "3. For production builds, update EAS configuration with Google client IDs"
print_color $WHITE ""
print_color $CYAN "📖 See setup-guide.md for detailed instructions"