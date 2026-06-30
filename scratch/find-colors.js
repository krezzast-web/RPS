const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, '..', 'frontend', 'src', 'index.css');
const content = fs.readFileSync(cssPath, 'utf8');
const lines = content.split('\n');

console.log('--- SCANNING FOR HEX BACKGROUNDS IN INDEX.CSS ---');
lines.forEach((line, idx) => {
  if ((line.includes('background') || line.includes('border') || line.includes('color')) && line.includes('#')) {
    // Check if it's NOT our theme colors
    const hasWhite = line.includes('#fff') || line.includes('#FFF') || line.includes('#ffffff') || line.includes('#FFFFFF');
    const hasBlack = line.includes('#000') || line.includes('#000000');
    const hasThemeBg = line.includes('#1D1D1D') || line.includes('#1d1d1d');
    const hasThemeBorder = line.includes('#333333');
    const hasThemeAccent = line.includes('#DFFE00') || line.includes('#dffe00');
    const hasRed = line.includes('#f87171') || line.includes('#f43f5e');
    const hasGreen = line.includes('#4ade80') || line.includes('#10b981');
    const hasOrange = line.includes('#fbbf24') || line.includes('#f59e0b');
    const hasGrey = line.includes('#888') || line.includes('#555') || line.includes('#666') || line.includes('#444') || line.includes('#222') || line.includes('#111') || line.includes('#aaa') || line.includes('#ccc') || line.includes('#eee') || line.includes('#ddd');

    if (!hasWhite && !hasBlack && !hasThemeBg && !hasThemeBorder && !hasThemeAccent && !hasRed && !hasGreen && !hasOrange && !hasGrey) {
      console.log(`Line ${idx + 1}: ${line.trim()}`);
    }
  }
});
