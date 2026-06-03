/**
 * Auto-remove white-ish background from logo PNG.
 * Replace pixel close to white (#FFFFFF) with transparent.
 */
const fs = require('fs');
const { PNG } = require('pngjs');

const INPUT = 'public/logo-tab.png';
const OUTPUT = 'public/logo-tab.png';
const TOLERANCE = 30; // 0-255: anggap putih kalau RGB > 255-TOLERANCE

const buf = fs.readFileSync(INPUT);
const png = PNG.sync.read(buf);
console.log('Loaded:', png.width, 'x', png.height);

let removed = 0;
for (let y = 0; y < png.height; y++) {
  for (let x = 0; x < png.width; x++) {
    const idx = (png.width * y + x) << 2;
    const r = png.data[idx];
    const g = png.data[idx + 1];
    const b = png.data[idx + 2];
    if (r >= 255 - TOLERANCE && g >= 255 - TOLERANCE && b >= 255 - TOLERANCE) {
      png.data[idx + 3] = 0;
      removed++;
    }
  }
}
fs.writeFileSync(OUTPUT, PNG.sync.write(png));
console.log('Pixel ditukar transparent:', removed, '/', png.width * png.height);
console.log('Saved:', OUTPUT);
