#!/bin/bash

# Trinity Production Deployment Script
# Deploys the complete Trinity infrastructure with all refactorizations

set -e  # Exit on any error

echo "🚀 Starting Trinity Production Deployment..."
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if required environment variables are set
check_env_vars() {
    print_status "Checking required environment variables..."
    
    required_vars=(
        "TMDB_API_KEY"
        "HF_API_TOKEN"
        "AWS_REGION"
        "AWS_ACCOUNT_ID"
    )
    
    missing_vars=()
    
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            missing_vars+=("$var")
        fi
    done
    
    if [ ${#missing_vars[@]} -ne 0 ]; then
        print_error "Missing required environment variables:"
        for var in "${missing_vars[@]}"; do
            echo "  - $var"
        done
        echo ""
        echo "Please set these variables and try again."
        echo "Example:"
        echo "  export TMDB_API_KEY=your_tmdb_key"
        echo "  export HF_API_TOKEN=your_huggingface_token"
        exit 1
    fi
    
    print_success "All required environment variables are set"
}

# Install dependencies
install_dependencies() {
    print_status "Installing dependencies..."
    
    if [ ! -f "package.json" ]; then
        print_error "package.json not found. Are you in the infrastructure directory?"
        exit 1
    fi
    
    npm install
    print_success "Dependencies installed"
}

# Build TypeScript
build_typescript() {
    print_status "Building TypeScript..."
    npm run build
    print_success "TypeScript build completed"
}

# Bootstrap CDK (if needed)
bootstrap_cdk() {
    print_status "Checking CDK bootstrap status..."
    
    # Check if bootstrap is needed
    if ! aws cloudformation describe-stacks --stack-name CDKToolkit --region ${AWS_REGION} >/dev/null 2>&1; then
        print_warning "CDK not bootstrapped. Bootstrapping now..."
        npx cdk bootstrap aws://${AWS_ACCOUNT_ID}/${AWS_REGION}
        print_success "CDK bootstrap completed"
    else
        print_success "CDK already bootstrapped"
    fi
}

# Deploy infrastructure
deploy_infrastructure() {
    print_status "Deploying Trinity infrastructure..."
    
    # Set deployment stage
    STAGE=${STAGE:-prod}
    
    print_status "Deploying to stage: $STAGE"
    
    # Deploy with all required environment variables
    npx cdk deploy \
        --context stage=$STAGE \
        --require-approval never \
        --outputs-file cdk-outputs.json
    
    print_success "Infrastructure deployment completed"
}

# Verify deployment
verify_deployment() {
    print_status "Verifying deployment..."
    
    if [ -f "cdk-outputs.json" ]; then
        print_success "CDK outputs file created"
        
        # Extract key outputs
        if command -v jq >/dev/null 2>&1; then
            GRAPHQL_URL=$(jq -r '.TrinityStack.GraphQLApiUrl // empty' cdk-outputs.json)
            USER_POOL_ID=$(jq -r '.TrinityStack.UserPoolId // empty' cdk-outputs.json)
            
            if [ -n "$GRAPHQL_URL" ] && [ -n "$USER_POOL_ID" ]; then
                print_success "Key resources deployed successfully:"
                echo "  - GraphQL API: $GRAPHQL_URL"
                echo "  - User Pool ID: $USER_POOL_ID"
            else
                print_warning "Could not extract all expected outputs"
            fi
        else
            print_warning "jq not installed. Cannot parse outputs automatically."
            echo "CDK outputs saved to cdk-outputs.json"
        fi
    else
        print_warning "CDK outputs file not found"
    fi
}

# Display post-deployment instructions
post_deployment_instructions() {
    echo ""
    echo "=================================================="
    print_success "🎉 Trinity Deployment Completed Successfully!"
    echo "=================================================="
    echo ""
    echo "📋 Next Steps:"
    echo ""
    echo "1. 📱 Update Mobile App Configuration:"
    echo "   - Copy GraphQL API URL to mobile app config"
    echo "   - Update Cognito User Pool ID in mobile app"
    echo ""
    echo "2. 🔧 Configure Environment Variables:"
    echo "   - TMDB_API_KEY: ✅ Set"
    echo "   - HF_API_TOKEN: ✅ Set"
    echo "   - Circuit Breaker settings: Using defaults"
    echo ""
    echo "3. 📊 Monitor Deployment:"
    echo "   - Check CloudWatch logs for Lambda functions"
    echo "   - Monitor Circuit Breaker metrics"
    echo "   - Verify real-time subscriptions work"
    echo ""
    echo "4. 🧪 Test Key Features:"
    echo "   - Create a room"
    echo "   - Join room with multiple users"
    echo "   - Test voting and Stop-on-Match algorithm"
    echo "   - Test Trini AI recommendations"
    echo "   - Verify Circuit Breaker with TMDB API"
    echo ""
    echo "5. 🚨 Set Up Monitoring:"
    echo "   - Configure CloudWatch alarms"
    echo "   - Set up Circuit Breaker state alerts"
    echo "   - Monitor business metrics"
    echo ""
    
    if [ -f "cdk-outputs.json" ]; then
        echo "📄 Deployment outputs saved to: cdk-outputs.json"
    fi
    
    echo ""
    print_success "Trinity is ready for production! 🚀"
}

# Main deployment flow
main() {
    echo "🎬 Trinity - Advanced Serverless Movie Discovery Platform"
    echo "🏗️  Architecture: Circuit Breaker + Stop-on-Match + Real-time + AI"
    echo ""
    
    check_env_vars
    install_dependencies
    build_typescript
    bootstrap_cdk
    deploy_infrastructure
    verify_deployment
    post_deployment_instructions
}

# Run main function
main "$@"