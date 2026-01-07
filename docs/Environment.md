# Environment & Configuration

## Required Variables
- `VERIFY_TOKEN`: Token used by Meta to verify your webhook (string).
- `WHATSAPP_TOKEN`: Bearer token for WhatsApp Cloud API (system user token).
- `PHONE_NUMBER_ID`: WhatsApp phone number ID.
- `VERSION`: Graph API version (e.g., v18.0).
- `WABA_ID`: WhatsApp Business Account ID.
- `NODE_ENV`: `production` on Railway.
- `PORT`: Set by platform; app uses `PORT` or defaults to 3002 locally.
- `PUBLIC_URL`: Public base URL (Railway domain).
- `DATABASE_URL`: Postgres connection string; SSL required in production.

## Files
- `.env.example`: Template with all keys. Copy to `.env` for local dev.

## Notes
- On Railway, define variables in the service settings. Ensure `VERIFY_TOKEN` matches exactly what you enter in Meta.
- For Postgres on Railway, reference the Postgres service's `DATABASE_URL` using the Variables UI.
