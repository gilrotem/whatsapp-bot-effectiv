# WhatsApp Bot - Effective Garden Sheds

WhatsApp chatbot for lead qualification using Meta Cloud API and Postgres.

## Features

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in your credentials:
```bash
cp .env.example .env
```

3. Setup local Postgres (or use Render Postgres connection string)

4. Run the bot:
```bash
npm start
```

## Deploy to Render

### Step 1: Create Postgres Database
1. Go to Render Dashboard
2. Click "New" → "PostgreSQL"
3. Name it (e.g., `whatsapp-bot-db`)
4. Copy the **Internal Database URL**

### Step 2: Create Web Service
1. Click "New" → "Web Service"
2. Connect your GitHub repository
3. Configure:
   - **Name**: `whatsapp-bot`
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

### Step 3: Add Environment Variables
Add these in Render → Environment:

### Step 4: Deploy
1. Click "Create Web Service"
2. Wait for deployment (~2-3 minutes)
3. Copy your Render URL (e.g., `https://whatsapp-bot-xyz.onrender.com`)

### Step 5: Update Meta Webhook
1. Go to Meta Developer Dashboard
2. WhatsApp → Configuration
3. Update Callback URL: `https://your-render-url.onrender.com/webhook`
4. Verify Token: (use the same token from env)
5. Click "Verify and Save"

## Database Schema

### Tables

## Tech Stack

## License
ISC

## Quick Links
 - Runbook: [docs/Runbook.md](docs/Runbook.md)
 - Environment: [docs/Environment.md](docs/Environment.md)
 - Meta Webhook: [docs/MetaWebhook.md](docs/MetaWebhook.md)
 - Troubleshooting: [docs/Troubleshooting.md](docs/Troubleshooting.md)

## Daily Ops
 - Health: open `${PUBLIC_URL}/healthz` or run `node scripts/health_check.js`.
 - Backup DB: `node scripts/backup_db.js` → outputs JSON to `backups/<timestamp>/`.
 - Redeploy: push to Git, then Deploy from latest commit in Railway.

## Current Status
 See [docs/Runbook.md](docs/Runbook.md) for the most recent state and next steps.
- Meta Cloud API
