const fs = require('fs');
const path = require('path');

function getFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFiles(filePath));
    } else if (file.endsWith('.jsx') || file.endsWith('.js')) {
      results.push(filePath);
    }
  });
  return results;
}

const srcDir = path.join(__dirname, '..', 'frontend', 'src');
const files = getFiles(srcDir);

console.log('--- SEARCHING FOR "createCustomRoom" or "createRoom" ---');
files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('createCustomRoom') || line.includes('createRoomModalOpen') || line.includes('setCreateRoomModalOpen')) {
      console.log(`${path.basename(file)}:${idx + 1}: ${line.trim()}`);
    }
  });
});
