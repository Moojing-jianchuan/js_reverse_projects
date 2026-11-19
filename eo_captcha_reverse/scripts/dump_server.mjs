import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const out = path.join(process.cwd(), 'samples');
const server = http.createServer((req, res) => {
  const url = req.url || '/';
  if (req.method === 'GET') {
    const name = url.replace(/^\//, '').split('?')[0].replace(/[^\w.-]/g, '_');
    const file = path.join(out, name);
    if (fs.existsSync(file)) {
      const body = fs.readFileSync(file);
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      res.end(body);
      return;
    }
    res.writeHead(404, { 'access-control-allow-origin': '*' });
    res.end('nf');
    return;
  }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const name = url.replace(/^\//, '').split('?')[0].replace(/[^\w.-]/g, '_') || 'save';
    const file = path.join(out, 'dumped_' + name + '.json');
    try { fs.writeFileSync(file, body); } catch (e) { console.error(e.message); }
    console.log('dump', file, body.length);
    res.writeHead(204, { 'access-control-allow-origin': '*' });
    res.end();
  });
});
server.listen(8899, '127.0.0.1', () => console.log('listening 8899 (get+post)'));
setTimeout(() => { server.close(); process.exit(0); }, 900000);
