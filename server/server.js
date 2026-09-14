// server.js — SSMV backend. Built only on Node's standard library
// (http, fs, path) plus the built-in node:sqlite module, so `npm install`
// installs nothing extra and there is no external dependency to break.

const http = require('http');
const fs = require('fs');
const path = require('path');
const db = require('./db');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MEMBER_PASSCODE = process.env.SSMV_PASSCODE || 'SSMV2026';
const MAX_BODY_BYTES = 30 * 1024 * 1024; // 30MB — generous for a few compressed photos per request

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function sendJSON(res, status, obj){
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readJSONBody(req){
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if(size > MAX_BODY_BYTES){ reject(Object.assign(new Error('Payload too large'), { statusCode: 413 })); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if(chunks.length === 0) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch(e){ reject(Object.assign(new Error('Invalid JSON body'), { statusCode: 400 })); }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname){
  let rel = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(PUBLIC_DIR, path.normalize(decodeURIComponent(rel)));
  if(!filePath.startsWith(PUBLIC_DIR)){ res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (err, content) => {
    if(err){
      // SPA fallback: unknown non-API paths get index.html
      return fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err2, indexContent) => {
        if(err2){ res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(indexContent);
      });
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(content);
  });
}

const routes = [
  // ---------------------------------------------------------------- events
  { method: 'GET', pattern: /^\/api\/events$/, handler: async (req, res) => sendJSON(res, 200, db.getEvents()) },
  { method: 'POST', pattern: /^\/api\/events$/, handler: async (req, res) => {
      const body = await readJSONBody(req);
      if(!body.title || !body.date) return sendJSON(res, 400, { error: 'title and date are required' });
      sendJSON(res, 201, db.createEvent(body));
    } },
  { method: 'PUT', pattern: /^\/api\/events\/([^/]+)$/, handler: async (req, res, m) => {
      const body = await readJSONBody(req);
      const updated = db.updateEvent(m[1], body);
      if(!updated) return sendJSON(res, 404, { error: 'event not found' });
      sendJSON(res, 200, updated);
    } },
  { method: 'DELETE', pattern: /^\/api\/events\/([^/]+)$/, handler: async (req, res, m) => {
      db.deleteEvent(m[1]);
      sendJSON(res, 200, { ok: true });
    } },

  // ---------------------------------------------------------------- albums
  { method: 'GET', pattern: /^\/api\/albums$/, handler: async (req, res) => sendJSON(res, 200, db.getAlbums()) },
  { method: 'POST', pattern: /^\/api\/albums$/, handler: async (req, res) => {
      const body = await readJSONBody(req);
      if(!body.name) return sendJSON(res, 400, { error: 'name is required' });
      sendJSON(res, 201, db.createAlbum(body.name));
    } },
  { method: 'DELETE', pattern: /^\/api\/albums\/([^/]+)$/, handler: async (req, res, m) => {
      db.deleteAlbum(m[1]);
      sendJSON(res, 200, { ok: true });
    } },
  { method: 'POST', pattern: /^\/api\/albums\/([^/]+)\/photos$/, handler: async (req, res, m) => {
      const body = await readJSONBody(req);
      const photos = Array.isArray(body.photos) ? body.photos : [];
      if(photos.length === 0) return sendJSON(res, 400, { error: 'photos[] is required' });
      sendJSON(res, 201, db.addPhotos(m[1], photos));
    } },
  { method: 'PUT', pattern: /^\/api\/albums\/([^/]+)\/photos\/([^/]+)$/, handler: async (req, res, m) => {
      const body = await readJSONBody(req);
      const updated = db.updatePhoto(m[1], m[2], body);
      if(!updated) return sendJSON(res, 404, { error: 'photo not found' });
      sendJSON(res, 200, updated);
    } },
  { method: 'DELETE', pattern: /^\/api\/albums\/([^/]+)\/photos\/([^/]+)$/, handler: async (req, res, m) => {
      db.deletePhoto(m[1], m[2]);
      sendJSON(res, 200, { ok: true });
    } },

  // -------------------------------------------------------------- members
  { method: 'GET', pattern: /^\/api\/members$/, handler: async (req, res) => sendJSON(res, 200, db.getMembers()) },
  { method: 'POST', pattern: /^\/api\/members$/, handler: async (req, res) => {
      const body = await readJSONBody(req);
      if(!body.id || !body.name) return sendJSON(res, 400, { error: 'id and name are required' });
      sendJSON(res, 200, db.upsertMember(body));
    } },

  // ------------------------------------------------------------- passcode
  { method: 'POST', pattern: /^\/api\/verify-passcode$/, handler: async (req, res) => {
      const body = await readJSONBody(req);
      sendJSON(res, 200, { ok: !!body.code && body.code === MEMBER_PASSCODE });
    } }
];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if(req.method === 'OPTIONS'){ res.writeHead(204); return res.end(); }

  if(!pathname.startsWith('/api/')) return serveStatic(req, res, pathname);

  const route = routes.find(r => r.method === req.method && r.pattern.test(pathname));
  if(!route) return sendJSON(res, 404, { error: 'no such route' });

  try {
    const m = pathname.match(route.pattern);
    await route.handler(req, res, m);
  } catch(e){
    sendJSON(res, e.statusCode || 500, { error: e.message || 'server error' });
  }
});

server.listen(PORT, () => {
  console.log(`SSMV server running:  http://localhost:${PORT}`);
});
