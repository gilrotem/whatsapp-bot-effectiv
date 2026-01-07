# Meta Webhook Verification & Troubleshooting

## Verification Flow
Meta sends a GET request to your webhook URL:
`/webhook?hub.mode=subscribe&hub.verify_token=<TOKEN>&hub.challenge=<CHALLENGE>`
- If `<TOKEN>` equals your `VERIFY_TOKEN`, the server must respond 200 with the plain text `<CHALLENGE>`.

## How to Verify
- Callback URL: `${PUBLIC_URL}/webhook`
- Verify Token: the value of `VERIFY_TOKEN` (e.g., `gina2025`).
- Click "Verify and save".

## Troubleshooting
- "Application failed to respond":
  - Check Railway HTTP Logs for the exact request path and status.
  - Confirm service is public and listening on port `PORT` (Railway shows 8080).
  - Ensure `/webhook` GET responds quickly and with `text/plain`.
- 403 on verification:
  - `VERIFY_TOKEN` mismatch. Verify the value in Railway Variables.
- 504/timeout:
  - Inspect `index.js` for `/webhook` handler; app must not block.
  - Confirm network accessibility and no private networking only.

## Manual Test
Open in browser:
`${PUBLIC_URL}/webhook?hub.mode=subscribe&hub.verify_token=<VERIFY_TOKEN>&hub.challenge=1234`
Expected: page displays `1234`.
