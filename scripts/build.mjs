import { build } from 'esbuild';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
export async function buildExtension(outdir = path.join(root, 'dist')) {
  await mkdir(outdir, { recursive: true });
  await cp(path.join(root, 'public'), outdir, { recursive: true });
  await build({ entryPoints: [path.join(root, 'src/panel.ts'), path.join(root, 'src/background.ts')], bundle: true, outdir, splitting: true, format: 'esm', target: 'chrome140', chunkNames: 'chunks/[name]-[hash]', minify: true, legalComments: 'eof' });
  await build({ entryPoints: [path.join(root, 'src/content.ts')], bundle: true, outfile: path.join(outdir, 'content.js'), format: 'iife', target: 'chrome140', minify: true });
  await cp(path.join(root, 'src/panel.css'), path.join(outdir, 'panel.css'));
  const pdfRoot = path.join(root, 'node_modules/pdfjs-dist');
  await cp(path.join(pdfRoot, 'legacy/build/pdf.worker.mjs'), path.join(outdir, 'pdf.worker.mjs'));
  await cp(path.join(pdfRoot, 'cmaps'), path.join(outdir, 'cmaps'), { recursive: true });
  await cp(path.join(pdfRoot, 'standard_fonts'), path.join(outdir, 'standard_fonts'), { recursive: true });
  await cp(path.join(pdfRoot, 'LICENSE'), path.join(outdir, 'PDFJS-LICENSE.txt'));
  await mkdir(path.join(outdir, 'icons'), { recursive: true });
  for (const size of [16, 32, 48, 128]) await writeFile(path.join(outdir, `icons/${size}.png`), makeIcon(size));
  console.log(`Built extension: ${outdir}`);
}

function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ -1) >>> 0;
}
function chunk(name, bytes) {
  const type = Buffer.from(name), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length); crc.writeUInt32BE(crc32(Buffer.concat([type, bytes])));
  return Buffer.concat([length, type, bytes, crc]);
}
function makeIcon(size) {
  const pixels = Buffer.alloc((size * 4 + 1) * size);
  const segment = (x, y, ax, ay, bx, by) => { const u = Math.max(0, Math.min(1, ((x-ax)*(bx-ax)+(y-ay)*(by-ay))/((bx-ax)**2+(by-ay)**2))); return Math.hypot(x-ax-u*(bx-ax),y-ay-u*(by-ay)); };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const px = (x + .5) / size * 24, py = (y + .5) / size * 24;
    const offset = y * (size * 4 + 1) + 1 + x * 4;
    const outside = Math.hypot(Math.max(Math.abs(px - 12) - 6.5, 0), Math.max(Math.abs(py - 12) - 6.5, 0)) > 4.5;
    const edges = [[7,5,14,5],[14,5,18,9],[18,9,18,20],[18,20,7,20],[7,20,7,5],[14,5,14,9],[14,9,18,9],[10,12,15,12],[10,16,14,16]];
    const ink = edges.some(([ax,ay,bx,by]) => segment(px,py,ax,ay,bx,by) < .8);
    pixels.set(ink ? [255,255,255,255] : [33,57,67,outside ? 0 : 255], offset);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR',header), chunk('IDAT',deflateSync(pixels)), chunk('IEND',Buffer.alloc(0))]);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildExtension();
