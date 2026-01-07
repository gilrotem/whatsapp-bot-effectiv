# WhatsApp Bot Runbook

This runbook captures the current state, how to operate the service, and the next steps.

## Current Status (2026-01-08)
- App is deployed on Railway and listening on port 8080.
- Database (Postgres) is connected; tables initialized.
- Health and webhook handlers are implemented in `index.js`.
- Webhook verification in Meta is failing with "Application failed to respond" at the callback URL.

## Next Critical Steps
1. Verify public endpoints respond:
   - Root: `${PUBLIC_URL}/` should return text.
   - Health: `${PUBLIC_URL}/healthz` should return JSON with `hasVerifyToken: true`.
   - Webhook verification: `${PUBLIC_URL}/webhook?hub.mode=subscribe&hub.verify_token=<VERIFY_TOKEN>&hub.challenge=1234` should echo `1234`.
2. If the webhook still fails:
   - Open Railway HTTP Logs and locate the request by ID. Note path, status, and duration.
   - Ensure `VERIFY_TOKEN` in Railway Variables matches exactly what Meta uses.
   - Confirm service is public and bound to `0.0.0.0` (it is in `index.js`).

## Daily Operations
- View deploy logs and HTTP logs in Railway to diagnose issues.
- Use `scripts/health_check.js` to test health endpoint locally and remotely.
- Backup DB using `node scripts/backup_db.js` (creates JSON dumps under `/backups`).

## Redeploy Procedure
1. Commit and push changes to Git.
2. In Railway, Redeploy from the latest commit.
3. Watch for:
   - `Server is listening on port 8080`
   - `Database connected`

## Meta Webhook Setup
- Callback URL: `${PUBLIC_URL}/webhook`
- Verify Token: value of `VERIFY_TOKEN` (e.g., `gina2025`)
- On save, Meta will hit the GET verification URL with `hub.challenge`.

## Contact Points
- Code entry: `index.js`
- DB helpers: `db.js`
- Scripts: `scripts/*`
