import fs from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const [, , beforePath, afterPath, diffPath] = process.argv;
if (!beforePath || !afterPath || !diffPath) {
  console.error('Usage: node pixel-diff.mjs <before.png> <after.png> <diff.png>');
  process.exit(2);
}

const before = PNG.sync.read(fs.readFileSync(beforePath));
const after = PNG.sync.read(fs.readFileSync(afterPath));
const w = Math.min(before.width, after.width);
const h = Math.min(before.height, after.height);

const crop = (p) => {
  if (p.width === w && p.height === h) return p.data;
  const out = new PNG({ width: w, height: h });
  PNG.bitblt(p, out, 0, 0, w, h, 0, 0);
  return out.data;
};

const diff = new PNG({ width: w, height: h });
const mismatched = pixelmatch(crop(before), crop(after), diff.data, w, h, {
  threshold: 0.1,
  includeAA: false,
  alpha: 0.3,
  diffColor: [255, 0, 0]
});
fs.writeFileSync(diffPath, PNG.sync.write(diff));

// 8px grid region clustering — find dense diff regions
const GRID = 8;
const cells = new Map();
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const idx = (y * w + x) * 4;
    if (diff.data[idx] === 255 && diff.data[idx + 1] === 0 && diff.data[idx + 2] === 0) {
      const key = `${Math.floor(x / GRID)},${Math.floor(y / GRID)}`;
      cells.set(key, (cells.get(key) || 0) + 1);
    }
  }
}

const regions = [...cells.entries()]
  .filter(([, n]) => n >= 16)
  .map(([k, n]) => {
    const [cx, cy] = k.split(',').map(Number);
    return {
      bbox: { x: cx * GRID, y: cy * GRID, w: GRID, h: GRID },
      density: +(n / (GRID * GRID)).toFixed(2),
      pixels: n
    };
  })
  .sort((a, b) => b.density - a.density)
  .slice(0, 20);

console.log(
  JSON.stringify(
    {
      width: w,
      height: h,
      totalPixels: w * h,
      mismatchedPixels: mismatched,
      mismatchedPercent: +((mismatched / (w * h)) * 100).toFixed(2),
      diffPng: diffPath,
      regions
    },
    null,
    2
  )
);
