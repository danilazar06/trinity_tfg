# Trinity Backend Testing Scripts
# PowerShell script to run all backend tests

param(
    [string]$TestType = "all"
)

Write-Host "🚀 Trinity Backend Testing Suite" -ForegroundColor Green
Write-Host "=================================" -ForegroundColor Green

# Check Node.js availability
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js version: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js not found. Please install Node.js first." -ForegroundColor Red
    exit 1
}

# Check AWS CLI availability
try {
    $awsVersion = aws --version
    Write-Host "✅ AWS CLI available" -ForegroundColor Green
} catch {
    Write-Host "⚠️  AWS CLI not found. Some tests may fail." -ForegroundColor Yellow
}

# Set working directory
Set-Location $PSScriptRoot\..

Write-Host ""
Write-Host "📍 Current directory: $(Get-Location)" -ForegroundColor Cyan
Write-Host "🔗 GraphQL Endpoint: https://imx6fos5lnd3xkdchl4rqtv4pi.appsync-api.eu-west-1.amazonaws.com/graphql" -ForegroundColor Cyan
Write-Host "👤 User Pool ID: eu-west-1_6UxioIj4z" -ForegroundColor Cyan
Write-Host ""

switch ($TestType.ToLower()) {
    "smoke" {
        Write-Host "🧪 Running Smoke Tests..." -ForegroundColor Yellow
        node scripts/smoke-test.js
    }
    "circuit" {
        Write-Host "🔧 Running Circuit Breaker Tests..." -ForegroundColor Yellow
        node scripts/circuit-breaker-test.js
    }
    "all" {
        Write-Host "🧪 Running All Tests..." -ForegroundColor Yellow
        
        Write-Host ""
        Write-Host "1️⃣  SMOKE TESTS" -ForegroundColor Magenta
        Write-Host "===============" -ForegroundColor Magenta
        node scripts/smoke-test.js
        $smokeResult = $LASTEXITCODE
        
        Write-Host ""
        Write-Host "2️⃣  CIRCUIT BREAKER TESTS" -ForegroundColor Magenta
        Write-Host "=========================" -ForegroundColor Magenta
        node scripts/circuit-breaker-test.js
        $circuitResult = $LASTEXITCODE
        
        Write-Host ""
        Write-Host "📊 FINAL RESULTS" -ForegroundColor Green
        Write-Host "================" -ForegroundColor Green
        
        if ($smokeResult -eq 0) {
            Write-Host "✅ Smoke Tests: PASSED" -ForegroundColor Green
        } else {
            Write-Host "❌ Smoke Tests: FAILED" -ForegroundColor Red
        }
        
        if ($circuitResult -eq 0) {
            Write-Host "✅ Circuit Breaker Tests: PASSED" -ForegroundColor Green
        } else {
            Write-Host "❌ Circuit Breaker Tests: FAILED" -ForegroundColor Red
        }
        
        if ($smokeResult -eq 0 -and $circuitResult -eq 0) {
            Write-Host ""
            Write-Host "🎉 ALL TESTS PASSED! Backend is ready for production." -ForegroundColor Green
            exit 0
        } else {
            Write-Host ""
            Write-Host "⚠️  Some tests failed. Please review the results above." -ForegroundColor Yellow
            exit 1
        }
    }
    default {
        Write-Host "❌ Invalid test type. Use: smoke, circuit, or all" -ForegroundColor Red
        Write-Host ""
        Write-Host "Usage examples:" -ForegroundColor Cyan
        Write-Host "  .\scripts\run-tests.ps1 -TestType smoke" -ForegroundColor Cyan
        Write-Host "  .\scripts\run-tests.ps1 -TestType circuit" -ForegroundColor Cyan
        Write-Host "  .\scripts\run-tests.ps1 -TestType all" -ForegroundColor Cyan
        exit 1
    }
}

Write-Host ""
Write-Host "📋 For manual testing, see: MANUAL_TESTING_GUIDE.md" -ForegroundColor Cyan
Write-Host "🔧 For deployment, see: DEPLOYMENT.md" -ForegroundColor Cyan