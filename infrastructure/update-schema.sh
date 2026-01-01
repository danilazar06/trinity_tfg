#!/bin/bash

# ========================================
# TRINITY MVP - UPDATE GRAPHQL SCHEMA
# ========================================

set -e  # Exit on any error

echo "🔄 Updating GraphQL Schema in AppSync..."

# Get the GraphQL API ID from CDK outputs
if [ -f "cdk-outputs.json" ]; then
    API_ID=$(jq -r '.TrinityMvpStack.GraphQLApiId' cdk-outputs.json)
    if [ "$API_ID" = "null" ] || [ -z "$API_ID" ]; then
        echo "❌ Error: Could not find GraphQL API ID in cdk-outputs.json"
        exit 1
    fi
else
    echo "❌ Error: cdk-outputs.json not found. Please deploy the infrastructure first."
    exit 1
fi

# Check if schema.graphql exists
if [ ! -f "schema.graphql" ]; then
    echo "❌ Error: schema.graphql not found"
    exit 1
fi

echo "📋 Configuration:"
echo "  - API ID: $API_ID"
echo "  - Schema file: schema.graphql"

# Verify AWS CLI is available
if ! command -v aws &> /dev/null; then
    echo "❌ Error: AWS CLI not installed"
    exit 1
fi

# Verify AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ Error: AWS credentials not configured"
    echo "Run: aws configure"
    exit 1
fi

# Update the schema
echo "🚀 Updating AppSync GraphQL schema..."
aws appsync start-schema-creation \
    --api-id "$API_ID" \
    --definition fileb://schema.graphql

echo "⏳ Waiting for schema update to complete..."

# Wait for the schema update to complete
max_attempts=30
attempt=0

while [ $attempt -lt $max_attempts ]; do
    status=$(aws appsync get-schema-creation-status --api-id "$API_ID" --query 'status' --output text)
    
    case $status in
        "SUCCESS")
            echo "✅ Schema updated successfully!"
            break
            ;;
        "FAILED")
            echo "❌ Schema update failed!"
            aws appsync get-schema-creation-status --api-id "$API_ID" --query 'details' --output text
            exit 1
            ;;
        "PROCESSING")
            echo "⏳ Schema update in progress... (attempt $((attempt + 1))/$max_attempts)"
            sleep 5
            ;;
        *)
            echo "⚠️  Unknown status: $status"
            sleep 5
            ;;
    esac
    
    attempt=$((attempt + 1))
done

if [ $attempt -eq $max_attempts ]; then
    echo "❌ Timeout waiting for schema update to complete"
    exit 1
fi

echo ""
echo "🎉 GraphQL schema update completed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Test the getUserRooms query in the AppSync console"
echo "2. Update your mobile app to use the new query"
echo "3. Verify the Lambda handler is working correctly"