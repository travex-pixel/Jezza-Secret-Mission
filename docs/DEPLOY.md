# Deploying Project Jezza

See the Deployment section in the root README for the full picture. Short version:

1. `npm run build` produces `dist/client` (static) and `dist/server/index.js` (Node bundle).
2. `node dist/server/index.js` serves everything on `$PORT` (default 8787) and writes to `$DATA_DIR`.
3. Give `$DATA_DIR` a persistent disk and keep one instance running for the whole weekend.
4. Put it behind HTTPS (camera + share sheet need a secure origin) and make sure `/ws` upgrades are proxied.

Provided configs: `Dockerfile`, `fly.toml` (Fly.io, Sydney), `render.yaml` (Render blueprint).

Health check: `GET /api/health` → `{ ok: true, parties, uptime }`.

After the weekend: download `DATA_DIR/state.json` if you want the recap, then delete `DATA_DIR/photos`.
