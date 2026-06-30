const fs = require('fs');
const path = require('path');

const contextPath = path.join(__dirname, '..', 'frontend', 'src', 'context', 'GameContext.jsx');
const content = fs.readFileSync(contextPath, 'utf8');
const lines = content.split('\n');

const q = process.argv[2] || 'join_error';
console.log(`--- SEARCHING FOR "${q}" ---`);
lines.forEach((line, idx) => {
  if (line.includes(q)) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
});
