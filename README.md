# WhatsApp Bot - Effective Garden Sheds

WhatsApp chatbot for lead qualification using Meta Cloud API and Postgres.

## Features
- ✅ State machine conversation flow
- ✅ Interactive buttons and menus
- ✅ PostgreSQL persistence
- ✅ Lead tracking and logging
- ✅ Ready for Render deployment

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
- `PORT`: (leave empty, Render auto-assigns)
- `NODE_ENV`: `production`
- `VERIFY_TOKEN`: (your Meta verify token)
- `WHATSAPP_TOKEN`: (your Meta API token)
- `PHONE_NUMBER_ID`: (your WhatsApp phone number ID)
- `VERSION`: `v18.0`
- `DATABASE_URL`: (paste the Postgres Internal URL from Step 1)

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
- **sessions**: User conversation state
- **leads**: Completed lead data  
- **messages**: Full conversation log

## Tech Stack
- Node.js + Express
- PostgreSQL (Render)
- Meta Cloud API
- WhatsApp Business Platform

## License
ISC
