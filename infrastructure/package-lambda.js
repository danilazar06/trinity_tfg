const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('📦 Creating Lambda deployment package...');

// Create a temporary directory for the Lambda package
const tempDir = path.join(__dirname, 'lambda-package');
const handlersDir = path.join(tempDir, 'handlers');
const utilsDir = path.join(tempDir, 'utils');

// Clean up and create directories
if (fs.existsSync(tempDir)) {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
fs.mkdirSync(tempDir, { recursive: true });
fs.mkdirSync(handlersDir, { recursive: true });
fs.mkdirSync(utilsDir, { recursive: true });

// Copy the handler files
console.log('📋 Copying handler files...');
fs.copyFileSync(
  path.join(__dirname, 'lib', 'handlers', 'room.js'),
  path.join(tempDir, 'room.js')
);

fs.copyFileSync(
  path.join(__dirname, 'lib', 'utils', 'metrics.js'),
  path.join(tempDir, 'utils', 'metrics.js')
);

// Create a minimal package.json for the Lambda
const packageJson = {
  "name": "trinity-room-handler",
  "version": "1.0.0",
  "main": "room.js",
  "dependencies": {
    "uuid": "^9.0.0",
    "@aws-sdk/client-dynamodb": "^3.282.0",
    "@aws-sdk/lib-dynamodb": "^3.282.0"
  }
};

fs.writeFileSync(
  path.join(tempDir, 'package.json'),
  JSON.stringify(packageJson, null, 2)
);

console.log('📦 Installing dependencies...');
try {
  execSync('npm install --production', { 
    cwd: tempDir, 
    stdio: 'inherit' 
  });
} catch (error) {
  console.error('❌ Error installing dependencies:', error.message);
  process.exit(1);
}

console.log('🗜️ Creating zip file...');
try {
  // Use Node.js archiver package to create the zip file
  const archiver = require('archiver');
  const output = fs.createWriteStream(path.join(__dirname, 'room-handler-complete.zip'));
  const archive = archiver('zip', { zlib: { level: 9 } });

  output.on('close', function() {
    console.log(`✅ Lambda package created: room-handler-complete.zip (${archive.pointer()} total bytes)`);
    
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
    
    console.log('🚀 Ready to deploy! Run: aws lambda update-function-code --function-name trinity-room-dev --zip-file fileb://room-handler-complete.zip');
  });

  archive.on('error', function(err) {
    throw err;
  });

  archive.pipe(output);
  archive.directory(tempDir, false);
  archive.finalize();
  
} catch (error) {
  console.error('❌ Error creating zip file:', error.message);
  
  // Fallback: try using 7zip if available
  try {
    console.log('🔄 Trying alternative zip method...');
    execSync(`7z a -tzip "${path.join(__dirname, 'room-handler-complete.zip')}" "${tempDir}\\*"`, { stdio: 'inherit' });
    console.log('✅ Lambda package created with 7zip: room-handler-complete.zip');
    
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
    
  } catch (fallbackError) {
    console.error('❌ Fallback zip creation also failed:', fallbackError.message);
    console.log('💡 Please manually zip the contents of:', tempDir);
    process.exit(1);
  }
}

console.log('🚀 Ready to deploy! Run: aws lambda update-function-code --function-name trinity-room-dev --zip-file fileb://room-handler-complete.zip');