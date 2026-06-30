const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '..', 'frontend', 'src', 'App.jsx');
const content = fs.readFileSync(appPath, 'utf8');
const lines = content.split('\n');

const start = parseInt(process.argv[2]) || 1;
const end = parseInt(process.argv[3]) || 65;

console.log(`--- VIEWING APP.JSX LINES ${start} TO ${end} ---`);
lines.slice(start - 1, end).forEach((line, idx) => {
  console.log(`${start + idx}: ${line}`);
});
