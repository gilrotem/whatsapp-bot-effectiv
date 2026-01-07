# WhatsApp Bot Project - Copilot Instructions

## Architecture
- **Direct Meta Integration**: We use the Meta Cloud API directly without 3rd party wrappers.
- **Backend**: Node.js with Express.
- **Protocol**: Webhook-based. Facebook sends events (messages) to our `/webhook` endpoint.
- **Security**: 
  - Validate incoming requests using `x-hub-signature`.
  - Use `dotenv` for secrets.

## Key Files
- `index.js`: Main entry point. Handles webhook verification and message processing.
- `.env`: Stores sensitive credentials (WABA ID, Token, Verify Token).

## Developer Workflow
1. **Local Development**: Use `ngrok` or similar to expose port 3000 to the internet.
2. **Meta Configuration**: URL must be set in the WhatsApp App Dashboard.
3. **Verification**: The `VERIFY_TOKEN` in `.env` must match the one entered in Meta Dashboard.

## Code Style
- **RTL Support**: Ensure any text processing handles Hebrew correctly.
- **Async/Await**: Use modern async patterns.
- **Error Handling**: Log errors clearly but do not crash the server on bad webhooks.

## Meta API Specifics
- Send messages via POST to `https://graph.facebook.com/{VERSION}/{PHONE_NUMBER_ID}/messages`
- Headers: `Authorization: Bearer {WHATSAPP_TOKEN}`
- Body: JSON payload according to message type (text, template, interactive).

## System User & Tokens
- Tokens are generated in Business Manager -> Users -> System Users.
- Must have `whatsapp_business_messaging` permission.
