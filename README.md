# FAF Daily

A daily "guess the unit" game for **Supreme Commander: Forged Alliance** — in the
style of Wordle/Loldle. One mystery unit per day (same for everyone, UTC). Guess
any base-faction unit; the grid reveals which attributes match.

- **Faction · Tech · Unit/Building · Domain · Weapon · Yields · Role · Mass · HP · Build · Abilities**
- 🟩 exact match · 🟨 partial / close · 🟥 no · ↑/↓ answer is higher / lower
- 286 base-faction units (Aeon/UEF/Cybran/Seraphim). **Nomads excluded.**
- Unit build-icons are self-hosted in `public/icons`, downloaded from the
  [FAForever/UnitDB](https://github.com/FAForever/UnitDB) repo by `npm run fetch-icons`
  (with a neutral fallback if one is missing).
- **Answer resolved server-side** (see `server/`): the daily/challenge pick and
  every grid comparison are computed by a small Node service behind a secret, so
  the answer never reaches the browser until you've solved it — you can't read it
  from devtools or recompute it from the bundle. No accounts. The SPA still holds
  the unit *list* for search (that isn't the answer).

## Architecture
- `src/` - the React SPA, built to `dist/`.
- `server/` - a dependency-free Node service that resolves the answer
  (`server/answer.ts`), builds the board (`server/state.ts`), serves
  `POST /api/daily/state`, and serves the built SPA from `dist/`
  (`server/static.ts`). It reuses the same `src/lib` logic (`compare`,
  `challenge`, `units`) so the rules live in one place.
- In production it is one container: `npm run build:server` bundles the server
  into a single `build/server.mjs`, and the image holds only that plus `dist/`.
  `GET /api/health` is the health check.

## Develop
```bash
npm install
npm run server       # answer API on :8090 (needed for the game to work)
npm run dev          # http://localhost:5174 (proxies /api -> :8090)
npm run typecheck && npm run typecheck:server
npm run build        # -> dist/
npm run build:server # -> build/server.mjs
```

## Regenerate the unit list
Drop a fresh FAF `unitlist.json` export into `scripts/source-unitlist.json`, then:
```bash
npm run build:units  # rewrites src/data/units.json
```

## Deploy

### FAF's cluster
Every push to `main` builds the image and publishes it to Docker Hub as
`faforever/faf-daily:latest` plus a tag per commit
(`.github/workflows/image.yml`). The cluster picks up a new `latest` on its own,
so pushing to `main` is the release. The publish step only runs once the repo
lives in the FAForever organization, whose Docker Hub credentials it uses.

The container listens on 8090, runs as the unprivileged `node` user (uid 1000)
and keeps its state in `/data`: the answer secret (`secret`) and the solve
counter (`stats.json`). Run a single replica, since both are plain files.

### Docker Compose
```bash
docker compose up -d --build   # site on host :8081
```
Point your edge reverse proxy at host port 8081. The `data-owner` service runs
once before the site and hands the volume to uid 1000, so a volume written by an
older version that ran as root stays readable.

### The answer secret
On first run the service generates a random answer secret and keeps it in
`/data/secret`, so answers stay stable across restarts. To control it yourself,
set `DAILY_SECRET` (a long random string). **Changing or losing the secret
reshuffles today's and every future answer**, so when moving the site to a new
host, carry the existing secret over: copy `/data/secret` into the new volume,
or set its contents as `DAILY_SECRET`. If the secret file can't be read or
written and `DAILY_SECRET` isn't set, the service exits rather than run with a
throwaway secret.
