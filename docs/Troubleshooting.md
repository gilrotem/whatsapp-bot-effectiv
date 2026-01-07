# Troubleshooting

## Common Issues
- ECONNREFUSED to Postgres: `DATABASE_URL` not set or points to localhost.
- Webhook verification fails:
  - Verify Token mismatch → set `VERIFY_TOKEN` in Railway to the same value used in Meta.
  - Timeout / Application failed to respond → verify `/webhook` and `/healthz` endpoints; check HTTP logs.
- No logs for verification request → request may not reach the service; confirm domain and service binding.

## Quick Checks
- `${PUBLIC_URL}/healthz` returns JSON with `hasVerifyToken: true`.
- `${PUBLIC_URL}/` returns plain text quickly.
- In `index.js`, server binds to `0.0.0.0` and logs startup.

## Logs
- Railway → Deploy Logs for startup messages.
- Railway → HTTP Logs to see per-request path, status, duration.
