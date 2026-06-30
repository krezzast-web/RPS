const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, '..', 'frontend', 'src', 'index.css');
const content = fs.readFileSync(cssPath, 'utf8');
const lines = content.split('\n');

console.log('--- SCANNING ALL BACKGROUNDS IN INDEX.CSS ---');
lines.forEach((line, idx) => {
  if (line.includes('background') || line.includes('background-color')) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
});
