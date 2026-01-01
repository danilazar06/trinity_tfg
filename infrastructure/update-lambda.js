const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

// Configure AWS
const lambda = new AWS.Lambda({
  region: process.env.AWS_DEFAULT_REGION || 'us-east-1'
});

async function updateLambdaFunction() {
  try {
    console.log('🔄 Updating Lambda function...');
    
    // Read the zip file
    const zipPath = path.join(__dirname, 'lib', 'handlers', 'room-handler.zip');
    const zipBuffer = fs.readFileSync(zipPath);
    
    // Update the function code
    const result = await lambda.updateFunctionCode({
      FunctionName: 'trinity-room-dev',
      ZipFile: zipBuffer
    }).promise();
    
    console.log('✅ Lambda function updated successfully!');
    console.log('Function ARN:', result.FunctionArn);
    console.log('Last Modified:', result.LastModified);
    
  } catch (error) {
    console.error('❌ Error updating Lambda function:', error.message);
    
    if (error.code === 'ResourceNotFoundException') {
      console.log('💡 The function might have a different name. Let me list available functions...');
      
      try {
        const functions = await lambda.listFunctions().promise();
        const trinityFunctions = functions.Functions.filter(f => f.FunctionName.includes('trinity') || f.FunctionName.includes('room'));
        
        console.log('🔍 Found Trinity-related functions:');
        trinityFunctions.forEach(f => {
          console.log(`  - ${f.FunctionName} (${f.Runtime})`);
        });
      } catch (listError) {
        console.error('❌ Error listing functions:', listError.message);
      }
    }
  }
}

updateLambdaFunction();