const fs = require('fs');
const path = require('path');

const lobbyPath = path.join(__dirname, '..', 'frontend', 'src', 'components', 'Lobby.jsx');
const content = fs.readFileSync(lobbyPath, 'utf8');
const lines = content.split('\n');

const query = process.argv[2] || 'join';
console.log(`--- SEARCHING FOR "${query}" IN LOBBY.JSX ---`);
lines.forEach((line, idx) => {
  if (line.toLowerCase().includes(query.toLowerCase())) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
});
