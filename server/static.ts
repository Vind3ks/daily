/// <reference types="node" />
// Serves the built SPA (dist/) from the same process as the answer API, so the
// whole site is one container. This replaces the old nginx container and keeps
// its behaviour: SPA fallback to index.html, long caching for the hashed
// /assets and the per-unit /icons, gzip for text files over 1 KB.

import { readFileSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { IncomingMessage, ServerResponse } from 'node:http';

const ROOT = resolve(process.env.STATIC_DIR || 'dist');

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt']);

interface Entry {
  body: Buffer;
  gz: Buffer | null;
  type: string;
  cache: string;
}

// The files in an image never change, so each one is read (and gzipped) once.
// Only hits are kept: caching misses would let random URLs grow the map.
const files = new Map<string, Entry>();

function cacheControl(urlPath: string): string {
  if (urlPath.startsWith('/assets/')) return 'public, max-age=31536000, immutable'; // hashed by vite
  if (urlPath.startsWith('/icons/')) return 'public, max-age=2592000'; // stable per unit id
  if (urlPath === '/index.html') return 'no-cache'; // always pick up a new release
  return 'public, max-age=3600';
}

function load(urlPath: string): Entry | null {
  const hit = files.get(urlPath);
  if (hit) return hit;
  const file = resolve(ROOT, '.' + urlPath);
  if (!file.startsWith(ROOT + sep)) return null; // no escaping dist/ with ../
  try {
    if (!statSync(file).isFile()) return null;
    const ext = extname(file).toLowerCase();
    const body = readFileSync(file);
    const entry: Entry = {
      body,
      gz: COMPRESSIBLE.has(ext) && body.length >= 1024 ? gzipSync(body) : null,
      type: TYPES[ext] || 'application/octet-stream',
      cache: cacheControl(urlPath),
    };
    files.set(urlPath, entry);
    return entry;
  } catch {
    return null;
  }
}

// Answers GET/HEAD for anything in dist/. Returns false when there is nothing
// to serve, so the caller can send its own 404.
export function serveStatic(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  let urlPath: string;
  try {
    urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  } catch {
    return false;
  }
  if (urlPath.startsWith('/api/')) return false;
  if (urlPath.endsWith('/')) urlPath += 'index.html';

  let entry = load(urlPath);
  // SPA fallback, like nginx's try_files. Only for page-like paths: a missing
  // /assets/x.js should 404, not come back as HTML.
  if (!entry && !extname(urlPath)) entry = load('/index.html');
  if (!entry) return false;

  const gzip = entry.gz !== null && /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
  const body = gzip && entry.gz ? entry.gz : entry.body;
  const headers: Record<string, string> = {
    'Content-Type': entry.type,
    'Content-Length': String(body.length),
    'Cache-Control': entry.cache,
  };
  if (entry.gz) headers['Vary'] = 'Accept-Encoding';
  if (gzip) headers['Content-Encoding'] = 'gzip';
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
  return true;
}
