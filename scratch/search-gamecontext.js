const fs = require('fs');
const path = require('path');

const contextPath = path.join(__dirname, '..', 'frontend', 'src', 'context', 'GameContext.jsx');
const content = fs.readFileSync(contextPath, 'utf8');
const lines = content.split('\n');

const start = parseInt(process.argv[2]) || 340;
const end = parseInt(process.argv[3]) || 390;

console.log(`--- VIEWING GAMECONTEXT.JSX LINES ${start} TO ${end} ---`);
lines.slice(start - 1, end).forEach((line, idx) => {
  console.log(`${start + idx}: ${line}`);
});
