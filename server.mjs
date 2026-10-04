import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
const root = fileURLToPath(new URL('.', import.meta.url));
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.nlchart':'application/octet-stream', '.mp3':'audio/mpeg', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!path.startsWith(root.endsWith(sep) ? root : root + sep) || pathname.split('/').some(p => p.startsWith('.'))) { res.writeHead(403).end(); return; }
    const info = await stat(path);
    if (!info.isFile()) throw new Error('Not a file');
    const data = await readFile(path);
    const headers = { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control':'no-cache', 'Accept-Ranges':'bytes' };
    const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    if (range) {
      const start = Number(range[1]), end = Math.min(range[2] ? Number(range[2]) : data.length - 1, data.length - 1);
      if (start > end) { res.writeHead(416, {'Content-Range':`bytes */${data.length}`}).end(); return; }
      res.writeHead(206, { ...headers, 'Content-Range':`bytes ${start}-${end}/${data.length}`, 'Content-Length':end-start+1 }).end(data.subarray(start,end+1));
    } else res.writeHead(200, { ...headers, 'Content-Length':data.length }).end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404).end('Not found'); }
});
server.listen(Number(process.env.PORT || 5173), '127.0.0.1', () => console.log(`NoteLine → http://localhost:${server.address().port}`));
