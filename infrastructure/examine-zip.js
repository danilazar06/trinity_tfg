const fs = require('fs');
const path = require('path');

console.log('📦 Examining Lambda package contents...');

// Check if the lambda-package directory still exists (it should be cleaned up)
const packageDir = path.join(__dirname, 'lambda-package');
if (fs.existsSync(packageDir)) {
  console.log('⚠️  lambda-package directory still exists (should be cleaned up)');
  
  // Check if the files we copied exist
  const expectedFiles = [
    'room.js',
    'utils/metrics.js',
    'package.json'
  ];
  
  console.log('\n🔍 Checking package contents:');
  expectedFiles.forEach(file => {
    const filePath = path.join(packageDir, file);
    if (fs.existsSync(filePath)) {
      console.log(`✅ ${file} exists`);
      
      // For package.json, show the dependencies
      if (file === 'package.json') {
        const packageContent = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        console.log('   Dependencies:', Object.keys(packageContent.dependencies || {}));
      }
    } else {
      console.log(`❌ ${file} missing`);
    }
  });
  
  // Check if node_modules exists
  const nodeModulesPath = path.join(packageDir, 'node_modules');
  if (fs.existsSync(nodeModulesPath)) {
    console.log('✅ node_modules directory exists');
    
    // Check for specific dependencies
    const requiredDeps = ['uuid', '@aws-sdk/client-dynamodb', '@aws-sdk/lib-dynamodb'];
    requiredDeps.forEach(dep => {
      const depPath = path.join(nodeModulesPath, dep);
      if (fs.existsSync(depPath)) {
        console.log(`✅ ${dep} dependency exists`);
      } else {
        console.log(`❌ ${dep} dependency missing`);
      }
    });
    
    // List all top-level dependencies
    const deps = fs.readdirSync(nodeModulesPath).filter(name => !name.startsWith('.'));
    console.log(`📦 Total dependencies found: ${deps.length}`);
    console.log('First 10 dependencies:', deps.slice(0, 10));
  } else {
    console.log('❌ node_modules directory missing');
  }
} else {
  console.log('✅ lambda-package directory was properly cleaned up');
}

// Check if the zip file exists and its size
const zipPath = path.join(__dirname, 'room-handler-complete.zip');
if (fs.existsSync(zipPath)) {
  const stats = fs.statSync(zipPath);
  console.log(`\n📦 Zip file exists: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
} else {
  console.log('\n❌ Zip file missing');
}