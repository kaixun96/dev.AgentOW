// Side-by-side composite: BEFORE on the left, AFTER on the right.
// Borrowed from Builder.io micro-agent visual-test.ts approach:
// "the model's attention budget is halved and the diff descriptions become
// dramatically more specific than two separate attachments."

import fs from 'node:fs';
import sharp from 'sharp';

const [, , beforePath, afterPath, outPath] = process.argv;
if (!beforePath || !afterPath || !outPath) {
  console.error('Usage: node composite.mjs <before.png> <after.png> <out.png>');
  process.exit(2);
}

const before = sharp(beforePath);
const after = sharp(afterPath);
const [bMeta, aMeta] = await Promise.all([before.metadata(), after.metadata()]);

const GAP = 16;
const LABEL_H = 40;
const totalWidth = bMeta.width + GAP + aMeta.width;
const totalHeight = Math.max(bMeta.height, aMeta.height) + LABEL_H;

const labelSvg = (text, w) => Buffer.from(
  `<svg width="${w}" height="${LABEL_H}"><rect width="100%" height="100%" fill="#1f2937"/>` +
  `<text x="${w / 2}" y="26" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#fff" font-weight="700">${text}</text></svg>`
);

const out = await sharp({
  create: { width: totalWidth, height: totalHeight, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
})
  .composite([
    { input: labelSvg('BEFORE (v8 Panel — flight OFF)', bMeta.width), top: 0, left: 0 },
    { input: labelSvg('AFTER (v9 OverlayDrawer — flight ON)', aMeta.width), top: 0, left: bMeta.width + GAP },
    { input: fs.readFileSync(beforePath), top: LABEL_H, left: 0 },
    { input: fs.readFileSync(afterPath), top: LABEL_H, left: bMeta.width + GAP }
  ])
  .png()
  .toBuffer();

fs.writeFileSync(outPath, out);
console.log(
  JSON.stringify({
    out: outPath,
    width: totalWidth,
    height: totalHeight,
    beforeBbox: { x: 0, y: LABEL_H, w: bMeta.width, h: bMeta.height },
    afterBbox: { x: bMeta.width + GAP, y: LABEL_H, w: aMeta.width, h: aMeta.height }
  })
);
