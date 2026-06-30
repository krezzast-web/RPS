const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, '..', 'backend', 'server.js');
const content = fs.readFileSync(serverPath, 'utf8');
const lines = content.split('\n');

const query = process.argv[2] || 'join';
console.log(`--- SEARCHING FOR "${query}" IN SERVER.JS ---`);
lines.forEach((line, idx) => {
  if (line.toLowerCase().includes(query.toLowerCase())) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
});
