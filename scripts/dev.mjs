import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
import { buildExtension, root } from './build.mjs';

if (!process.argv.includes('--no-build')) await buildExtension();
const dist = path.join(root, 'dist');
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.bcmap':'application/octet-stream', '.pfb':'application/octet-stream' };
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const file = path.resolve(dist, '.' + decodeURIComponent(url.pathname === '/' ? '/panel.html' : url.pathname));
    if (!file.startsWith(dist + path.sep)) throw new Error('invalid path');
    response.setHeader('Content-Type', mime[path.extname(file)] ?? 'application/octet-stream');
    response.setHeader('Cache-Control', 'no-store');
    response.end(await readFile(file));
  } catch { response.writeHead(404).end('Not found'); }
});
server.listen(Number(process.env.PORT || 4173), '127.0.0.1', () => console.log('Preview: http://127.0.0.1:4173/panel.html'));
if (!process.argv.includes('--no-build')) {
  let timer, building = false;
  const rebuild = () => { clearTimeout(timer); timer = setTimeout(async () => { if (building) return; building = true; try { await buildExtension(); } catch (error) { console.error(error); } finally { building = false; } }, 150); };
  for (const folder of ['src','public']) watch(path.join(root, folder), { recursive:true }, rebuild);
}
