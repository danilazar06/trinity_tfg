#!/bin/bash

# Trinity Backend Testing Scripts
# Bash script to run all backend tests

set -e

TEST_TYPE=${1:-"all"}

echo "🚀 Trinity Backend Testing Suite"
echo "================================="

# Check Node.js availability
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "✅ Node.js version: $NODE_VERSION"
else
    echo "❌ Node.js not found. Please install Node.js first."
    exit 1
fi

# Check AWS CLI availability
if command -v aws &> /dev/null; then
    echo "✅ AWS CLI available"
else
    echo "⚠️  AWS CLI not found. Some tests may fail."
fi

# Set working directory
cd "$(dirname "$0")/.."

echo ""
echo "📍 Current directory: $(pwd)"
echo "🔗 GraphQL Endpoint: https://imx6fos5lnd3xkdchl4rqtv4pi.appsync-api.eu-west-1.amazonaws.com/graphql"
echo "👤 User Pool ID: eu-west-1_6UxioIj4z"
echo ""

case "$TEST_TYPE" in
    "smoke")
        echo "🧪 Running Smoke Tests..."
        node scripts/smoke-test.js
        ;;
    "circuit")
        echo "🔧 Running Circuit Breaker Tests..."
        node scripts/circuit-breaker-test.js
        ;;
    "all")
        echo "🧪 Running All Tests..."
        
        echo ""
        echo "1️⃣  SMOKE TESTS"
        echo "==============="
        set +e
        node scripts/smoke-test.js
        SMOKE_RESULT=$?
        set -e
        
        echo ""
        echo "2️⃣  CIRCUIT BREAKER TESTS"
        echo "========================="
        set +e
        node scripts/circuit-breaker-test.js
        CIRCUIT_RESULT=$?
        set -e
        
        echo ""
        echo "📊 FINAL RESULTS"
        echo "================"
        
        if [ $SMOKE_RESULT -eq 0 ]; then
            echo "✅ Smoke Tests: PASSED"
        else
            echo "❌ Smoke Tests: FAILED"
        fi
        
        if [ $CIRCUIT_RESULT -eq 0 ]; then
            echo "✅ Circuit Breaker Tests: PASSED"
        else
            echo "❌ Circuit Breaker Tests: FAILED"
        fi
        
        if [ $SMOKE_RESULT -eq 0 ] && [ $CIRCUIT_RESULT -eq 0 ]; then
            echo ""
            echo "🎉 ALL TESTS PASSED! Backend is ready for production."
            exit 0
        else
            echo ""
            echo "⚠️  Some tests failed. Please review the results above."
            exit 1
        fi
        ;;
    *)
        echo "❌ Invalid test type. Use: smoke, circuit, or all"
        echo ""
        echo "Usage examples:"
        echo "  ./scripts/run-tests.sh smoke"
        echo "  ./scripts/run-tests.sh circuit"
        echo "  ./scripts/run-tests.sh all"
        exit 1
        ;;
esac

echo ""
echo "📋 For manual testing, see: MANUAL_TESTING_GUIDE.md"
echo "🔧 For deployment, see: DEPLOYMENT.md"