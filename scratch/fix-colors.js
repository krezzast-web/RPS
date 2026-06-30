const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, '..', 'frontend', 'src', 'index.css');
let content = fs.readFileSync(cssPath, 'utf8');

const replacements = [
  [/#1a1a1a/gi, '#1D1D1D'],
  [/#2a2a2a/gi, '#333333'],
  [/#252525/gi, '#1D1D1D'],
  [/#151515/gi, '#1D1D1D'],
  [/#0b0b0f/gi, '#1D1D1D'],
  [/#1e1e2a/gi, '#333333'],
  [/#1e1e2d/gi, '#1D1D1D'],
  [/#2d2d42/gi, '#333333'],
  [/#12121c/gi, '#1D1D1D'],
  [/#151525/gi, '#1D1D1D'],
  [/#0b0b10/gi, '#1D1D1D'],
  [/#1c1c28/gi, '#333333'],
  [/#28283c/gi, '#1D1D1D'],
  [/#1e1e24/gi, '#1D1D1D'],
  [/#d4ff00/gi, '#DFFE00'],
  [/#a3ff00/gi, '#DFFE00']
];

let replacedCount = 0;
replacements.forEach(([regex, value]) => {
  const matches = content.match(regex);
  if (matches) {
    replacedCount += matches.length;
    content = content.replace(regex, value);
  }
});

fs.writeFileSync(cssPath, content, 'utf8');
console.log(`Successfully performed ${replacedCount} color replacements in index.css!`);
