# Deploying Project Jezza

See the Deployment section in the root README for the full picture. Short version:

1. `npm run build` produces `dist/client` (static) and `dist/server/index.js` (Node bundle).
2. `node dist/server/index.js` serves everything on `$PORT` (default 8787) and writes to `$DATA_DIR`.
3. Give `$DATA_DIR` a persistent disk and keep one instance running for the whole weekend.
4. Put it behind HTTPS (camera + share sheet need a secure origin) and make sure `/ws` upgrades are proxied.

Provided configs: `Dockerfile`, `fly.toml` (Fly.io, Sydney), `render.yaml` (Render blueprint).

Health check: `GET /api/health` → `{ ok: true, parties, uptime }`.

After the weekend: download `DATA_DIR/state.json` if you want the recap, then delete `DATA_DIR/photos`.

## Google Cloud Run (use this if you have a Firebase project)

Firebase Hosting only serves static files and cannot run the game server, but the same Google account can run it
on **Cloud Run** (same console, same billing as the Firebase project).

1. In the Firebase console, upgrade the project to the **Blaze** (pay-as-you-go) plan. Cloud Run requires billing;
   one small always-on instance for a weekend costs a few dollars at most.
2. Install the Google Cloud CLI and sign in: `gcloud auth login`.
3. From the repo: `PROJECT_ID=<your-project-id> ./scripts/deploy-cloudrun.sh`
   (about 3–5 minutes the first time; it builds the container, creates a storage bucket for state + photos,
   and starts one always-on instance in Sydney with WebSockets enabled).
4. Run it a second time so the share-link preview uses the final URL.
5. Open the URL it prints, tap **I'm the host**, share the join link.

Or let GitHub deploy it: add the `GCP_PROJECT_ID` and `GCP_SA_KEY` secrets described in
`.github/workflows/deploy-cloudrun.yml` and run that workflow.

To test before the weekend: `WS_URL=wss://<your-url>/ws npm run test:multiplayer` drives 15 simulated players
against the live server.
