/// <reference types="node" />
// Tiny dependency-free Node service for FAF Daily: the answer API plus the
// built site (dist/), so the whole thing is one container. In development run
// it with tsx (npm run server) next to vite; the image runs a bundled copy
// (npm run build:server). It never trusts a client-supplied date - every
// request resolves against the server's current UTC day, so tomorrow can't be
// pre-fetched.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildState } from './state';
import { statsFor, recordSolve } from './stats';
import { serveStatic } from './static';
import type { Mode } from './answer';

const PORT = Number(process.env.PORT) || 8090;
const SECRET_FILE = process.env.DAILY_SECRET_FILE || '/data/secret';

// A stable server secret salts the answer streams. Prefer an explicit env var;
// otherwise generate one once and persist it so answers stay stable across
// restarts/rebuilds (the file lives in a Docker volume).
//
// A different secret reshuffles today's and every future answer, so this never
// falls back to a throwaway one: if the file can't be read or written and
// DAILY_SECRET isn't set, the process exits and the failure is visible,
// instead of the answer silently changing on every restart.
function getSecret(): string {
  // Trimmed like the file is, so a pasted value with a stray newline still
  // gives the same answers as the file it was copied from.
  const fromEnv = process.env.DAILY_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  try {
    if (existsSync(SECRET_FILE)) {
      const s = readFileSync(SECRET_FILE, 'utf8').trim();
      if (s.length >= 16) return s;
    }
    const gen = randomBytes(32).toString('hex');
    mkdirSync(dirname(SECRET_FILE), { recursive: true });
    writeFileSync(SECRET_FILE, gen, { mode: 0o600 });
    console.log(`[daily-api] generated a new answer secret at ${SECRET_FILE}`);
    return gen;
  } catch (err) {
    console.error(
      `[daily-api] cannot read or create the answer secret at ${SECRET_FILE} and DAILY_SECRET is not set:`,
      err,
    );
    process.exit(1);
  }
}

const SECRET = getSecret();

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      data += chunk.toString('utf8');
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  try {
    if (req.method === 'GET' && req.url === '/api/health') {
      return send(res, 200, { ok: true });
    }

    if (req.method === 'POST' && req.url === '/api/daily/state') {
      const raw = await readBody(req);
      let body: { mode?: unknown; guesses?: unknown };
      try {
        body = JSON.parse(raw || '{}');
      } catch {
        return send(res, 400, { error: 'bad json' });
      }
      const mode: Mode = body.mode === 'challenge' ? 'challenge' : 'daily';
      // No count cap: readBody's 1MB limit guards abuse; max ~407 real units.
      const guesses: string[] = Array.isArray(body.guesses)
        ? body.guesses.filter((x): x is string => typeof x === 'string')
        : [];
      const now = new Date();
      const state = buildState(mode, now, guesses, SECRET, statsFor(now));
      return send(res, 200, state);
    }

    // A browser reports its first solve of the day (guarded client-side so it
    // only pings once per browser per mode per day). Best-effort tally.
    if (req.method === 'POST' && req.url === '/api/daily/solved') {
      const raw = await readBody(req);
      let body: { mode?: unknown };
      try {
        body = JSON.parse(raw || '{}');
      } catch {
        return send(res, 400, { error: 'bad json' });
      }
      const mode: Mode = body.mode === 'challenge' ? 'challenge' : 'daily';
      const stats = recordSolve(new Date(), mode);
      return send(res, 200, { ok: true, stats });
    }

    if (serveStatic(req, res)) return;

    return send(res, 404, { error: 'not found' });
  } catch (err) {
    console.error('[daily-api]', err);
    return send(res, 500, { error: 'server error' });
  }
});

server.listen(PORT, () => console.log(`[daily-api] listening on :${PORT}`));

// Docker and the cluster stop the container with SIGTERM. Node running as the
// container's main process ignores it unless a handler exists, so without this
// every restart or release waited out the full grace period before being
// killed. Nothing is buffered (stats are written synchronously), so stop
// taking connections and exit.
function shutdown(signal: string): void {
  console.log(`[daily-api] ${signal}, shutting down`);
  server.close(() => process.exit(0));
  server.closeIdleConnections();
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
