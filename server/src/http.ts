import { createReadStream, existsSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};

/** Minimal static file handler with SPA fallback to index.html. */
export function staticHandler(root: string) {
  const base = resolve(root);
  return (req: IncomingMessage, res: ServerResponse): void => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS });
      res.end('ok');
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, SECURITY_HEADERS);
      res.end();
      return;
    }
    let rel: string;
    try {
      rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    } catch {
      res.writeHead(400, SECURITY_HEADERS);
      res.end();
      return;
    }
    let file = join(base, rel);
    if (!file.startsWith(base + sep) && file !== base) {
      res.writeHead(403, SECURITY_HEADERS);
      res.end();
      return;
    }
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(base, 'index.html');
    if (!existsSync(file)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS });
      res.end('Клієнт не зібрано.');
      return;
    }
    const isAsset = rel.startsWith('assets/');
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': isAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
      ...SECURITY_HEADERS,
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(file).pipe(res);
  };
}
