const fs = require('fs');
const path = require('path');

const contextPath = path.join(__dirname, '..', 'frontend', 'src', 'context', 'GameContext.jsx');
const content = fs.readFileSync(contextPath, 'utf8');
const lines = content.split('\n');

console.log('--- SEARCHING FOR "room_created" IN GAMECONTEXT.JSX ---');
lines.forEach((line, idx) => {
  if (line.includes('room_created')) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
});
