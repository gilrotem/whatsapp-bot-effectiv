const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();

const { initDB, getSession, updateSession, saveLead, logMessage } = require('./db');
const { sendToTelegram, parseTelegramUpdate, setTelegramWebhook } = require('./telegram_client');
const botConfig = require('./botConfig.json');

const app = express();
app.use(bodyParser.json());
app.set('trust proxy', 1);

const { PORT, VERIFY_TOKEN, WHATSAPP_TOKEN, PHONE_NUMBER_ID, VERSION } = process.env;

// Root route for easy connectivity testing
app.get('/', (req, res) => {
    res.type('text/plain').send('Bot is running! Tunnel is active.');
});

// HEAD support for platform health checks
app.head('/', (req, res) => res.sendStatus(200));

// Lightweight health endpoint (no secrets)
app.get('/healthz', (req, res) => {
    const safe = {
        status: 'ok',
        hasVerifyToken: Boolean(VERIFY_TOKEN),
        verifyTokenLength: VERIFY_TOKEN ? VERIFY_TOKEN.length : 0,
        uptimeSec: Math.round(process.uptime()),
    };
    res.status(200).json(safe);
});

// Privacy Policy route for App Live verification
app.get('/privacy', (req, res) => {
    res.send('This is a development privacy policy. We value your privacy.');
});

// --- State Constants ---
const STATES = {
    WELCOME: 'STATE_WELCOME',
    QUALIFY_SIZE: 'STATE_QUALIFY_SIZE',
    QUALIFY_FLOOR: 'STATE_QUALIFY_FLOOR',
    ASK_LOCATION: 'STATE_ASK_LOCATION',
    SUMMARY_HANDOFF: 'STATE_SUMMARY_HANDOFF',
    HUMAN_HANDOFF: 'STATE_HUMAN_HANDOFF'
};

// --- Webhook Verification (GET) ---
// Meta calls this when you enter your URL in the dashboard
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    // Meta verification flow
    if (mode === 'subscribe') {
        console.log('WEBHOOK_VERIFICATION_REQUEST', {
            hasToken: Boolean(token),
            tokenLength: token ? String(token).length : 0,
            hasEnvToken: Boolean(VERIFY_TOKEN),
            envTokenLength: VERIFY_TOKEN ? VERIFY_TOKEN.length : 0,
            hasChallenge: Boolean(challenge)
        });
        if (token === VERIFY_TOKEN && challenge) {
            console.log('WEBHOOK_VERIFIED');
            res.set('Content-Type', 'text/plain');
            return res.status(200).send(String(challenge));
        }
        console.log('WEBHOOK_VERIFICATION_FAILED', { mode, token });
        return res.sendStatus(403);
    }

    // Non-verification probe
    res.status(200).send('Webhook endpoint');
});

// --- Incoming Messages (POST) ---
app.post('/webhook', async (req, res) => {
    const body = req.body;
    console.log('Incoming webhook:', JSON.stringify(body, null, 2));

    if (body.object) {
        if (
            body.entry &&
            body.entry[0].changes &&
            body.entry[0].changes[0].value.messages &&
            body.entry[0].changes[0].value.messages[0]
        ) {
            const message = body.entry[0].changes[0].value.messages[0];
            const phoneNumberId = body.entry[0].changes[0].value.metadata.phone_number_id;
            const from = message.from; 
            
            // 2. Anti-Echo (Prevent infinite loops)
            if (from === process.env.PHONE_NUMBER_ID) {
                 res.sendStatus(200);
                 return;
            }

            try {
                // Retrieve or create session in DB
                const session = await getSession(from);

                // Log incoming message
                const msgContent = message.text
                    ? message.text.body
                    : (message.interactive ? JSON.stringify(message.interactive) : 'media');

                // --- BRIDGE TO TELEGRAM ---
                await sendToTelegram(`📩 *חדש מאת ${from}*:\n${String(msgContent)}`);
                // --------------------------

                await logMessage(from, message.type, msgContent, 'incoming');

                // 3. Handoff Check: Stop bot if in handoff (unless resetting)
                const isReset = msgContent && (String(msgContent).toLowerCase() === 'reset' || msgContent === 'התחל');
                if (session.current_state === STATES.HUMAN_HANDOFF && !isReset) {
                    console.log(`Skipping bot logic for ${from} (HANDOFF active)`);
                    res.sendStatus(200);
                    return;
                }

                // Handle conversation state
                await handleStateLogic(phoneNumberId, from, message, session);
            } catch (error) {
                console.error('Error handling state logic:', error);
            }
        }
        res.sendStatus(200);
    } else {
        res.sendStatus(404);
    }
});

// --- Core State Machine Logic ---
async function handleStateLogic(phoneNumberId, from, message, session) {
    const messageType = message.type; // 'text' or 'interactive'
    
    // Extract user input (text or button ID)
    let userInput = null;
    let buttonId = null;

    if (messageType === 'text') {
        userInput = message.text.body;
    } else if (messageType === 'interactive') {
        if (message.interactive.type === 'button_reply') {
            buttonId = message.interactive.button_reply.id;
            userInput = message.interactive.button_reply.title;
        }
    }

    console.log(`Processing State: ${session.current_state}, Input: ${userInput}, ButtonID: ${buttonId}`);

    // Human Handoff Check (Global)
    if (userInput && (userInput.includes('נציג') || userInput.includes('אנושי') || userInput.toLowerCase().includes('agent'))) {
        await updateSession(from, { current_state: STATES.HUMAN_HANDOFF });
        await sendTextMessage(phoneNumberId, from, botConfig.messages.global_handoff_response);
        return;
    }

    switch (session.current_state) {
        
        case STATES.WELCOME:
            if (buttonId) {
                if (buttonId === 'btn_sales') {
                    await updateSession(from, { current_state: STATES.QUALIFY_SIZE, intent: 'sales' });
                    await sendSizeQuestion(phoneNumberId, from);
                } else if (buttonId === 'btn_order') {
                    await sendTextMessage(phoneNumberId, from, botConfig.messages.order_status_instruction);
                    await updateSession(from, { current_state: STATES.WELCOME });
                } else if (buttonId === 'btn_support') {
                    await updateSession(from, { current_state: STATES.HUMAN_HANDOFF });
                    await sendTextMessage(phoneNumberId, from, botConfig.messages.human_handoff_response);
                }
            } else {
                await sendWelcomeMessage(phoneNumberId, from);
            }
            break;

        case STATES.QUALIFY_SIZE:
            if (buttonId && (buttonId.startsWith('size_'))) {
                await updateSession(from, { shed_size: userInput, current_state: STATES.QUALIFY_FLOOR });
                await sendFlooringQuestion(phoneNumberId, from);
            } else {
                await sendTextMessage(phoneNumberId, from, botConfig.messages.validation_select_size);
                await sendSizeQuestion(phoneNumberId, from);
            }
            break;

        case STATES.QUALIFY_FLOOR:
            if (buttonId && (buttonId.startsWith('floor_'))) {
                await updateSession(from, { flooring_status: buttonId, current_state: STATES.ASK_LOCATION });
                
                let preText = "";
                if (buttonId === 'floor_no') {
                    preText = botConfig.messages.sales_floor_warning;
                }
                
                await sendTextMessage(phoneNumberId, from, preText + botConfig.messages.sales_location_last_step);
            } else {
                await sendTextMessage(phoneNumberId, from, botConfig.messages.validation_select_floor);
                await sendFlooringQuestion(phoneNumberId, from);
            }
            break;

        case STATES.ASK_LOCATION:
            if (messageType === 'text') {
                await updateSession(from, { city: userInput, current_state: STATES.SUMMARY_HANDOFF });
                
                // Save completed lead
                session.lead_data.city = userInput; // Update local object for saveLead
                await saveLead(session);
                
                // Construct summary message from config
                const summaryMsg = botConfig.messages.lead_completion_summary.replace('{city}', userInput);
                await sendTextMessage(phoneNumberId, from, summaryMsg);
                
                console.log("!!! NEW LEAD COMPLETED !!!", session);
                
                // Reset to welcome
                await updateSession(from, { current_state: STATES.WELCOME });
            } else {
                await sendTextMessage(phoneNumberId, from, botConfig.messages.validation_enter_city);
            }
            break;

        case STATES.HUMAN_HANDOFF:
            if (userInput === 'reset' || userInput === 'התחל') {
                await updateSession(from, { current_state: STATES.WELCOME });
                await sendWelcomeMessage(phoneNumberId, from);
            }
            break;
        case STATES.SUMMARY_HANDOFF:
            await sendWelcomeMessage(phoneNumberId, from);
            await updateSession(from, { current_state: STATES.WELCOME });
            break;
            
        default:
            await updateSession(from, { current_state: STATES.WELCOME });
            await sendWelcomeMessage(phoneNumberId, from);
            break;
    }
}

// --- Message Helper Functions ---

async function sendWelcomeMessage(phoneNumberId, to) {
    const text = botConfig.messages.welcome;
    const buttons = botConfig.buttons.welcome_menu.map(btn => ({ 
        type: "reply", 
        reply: { id: btn.id, title: btn.title } 
    }));
    await sendInteractiveMessage(phoneNumberId, to, text, buttons);
}

async function sendSizeQuestion(phoneNumberId, to) {
    const text = botConfig.messages.sales_question_size;
    const buttons = botConfig.buttons.size_options.map(btn => ({ 
        type: "reply", 
        reply: { id: btn.id, title: btn.title } 
    }));
    await sendInteractiveMessage(phoneNumberId, to, text, buttons);
}

async function sendFlooringQuestion(phoneNumberId, to) {
    const text = botConfig.messages.sales_question_floor;
    const buttons = botConfig.buttons.floor_options.map(btn => ({ 
        type: "reply", 
        reply: { id: btn.id, title: btn.title } 
    }));
    await sendInteractiveMessage(phoneNumberId, to, text, buttons);
}

async function sendTextMessage(phoneNumberId, to, text) {
    await axios({
        method: "POST",
        url: `https://graph.facebook.com/${VERSION || 'v18.0'}/${phoneNumberId}/messages`,
        data: {
            messaging_product: "whatsapp",
            to: to,
            text: { body: text },
        },
        headers: {
            "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
            "Content-Type": "application/json",
        },
    });
}

async function sendInteractiveMessage(phoneNumberId, to, bodyText, buttons) {
    await axios({
        method: "POST",
        url: `https://graph.facebook.com/${VERSION || 'v18.0'}/${phoneNumberId}/messages`,
        data: {
            messaging_product: "whatsapp",
            to: to,
            type: "interactive",
            interactive: {
                type: "button",
                body: { text: bodyText },
                action: {
                    buttons: buttons
                }
            }
        },
        headers: {
            "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
            "Content-Type": "application/json",
        },
    });
}

// --- Telegram Webhook Logic (The Bridge) ---
app.post('/telegram_webhook', async (req, res) => {
    try {
        // 1. Acknowledge quickly
        res.sendStatus(200);

        // 2. Process
        const update = parseTelegramUpdate(req.body);
        if (!update) return; // Not a relevant message

        const { whatsappPhone, messageText } = update;
        console.log(`💬 Admin replying to ${whatsappPhone}: ${messageText}`);

        // 3. Send to WhatsApp
        await sendTextMessage(PHONE_NUMBER_ID, whatsappPhone, messageText);
        await sendToTelegram(`✅ Sent to ${whatsappPhone}`);
    } catch (err) {
        console.error('❌ Error in /telegram_webhook handler:', err.message);
        // We already sent 200, so we can't send another response.
        // But we catch the error to prevent any crash.
    }
});


// Initialize database and start server
async function startServer() {
    // 1. Fail Fast: Check critical configuration
    // Note: DATABASE_URL is not critical for local dev (uses Mock DB)
    const missingEnvs = ['VERIFY_TOKEN', 'WHATSAPP_TOKEN', 'PHONE_NUMBER_ID']
        .filter(key => !process.env[key]);
        
    if (missingEnvs.length > 0) {
        console.error(`❌ CRITICAL ERROR: Missing environment variables: ${missingEnvs.join(', ')}`);
        process.exit(1);
    }

    try {
        const port = Number(PORT) || 3002;
        const host = '0.0.0.0';

        // Start server IMMEDIATELY to satisfy Railway health checks
        app.listen(port, host, () => {
            console.log(`✅ Server is listening on port ${port} host ${host}`);

            // Initialize Telegram Webhook if PUBLIC_URL is set
            if (process.env.PUBLIC_URL) {
                setTelegramWebhook(process.env.PUBLIC_URL);
            } else {
                console.log('⚠️ TELEGRAM NOTE: Configure PUBLIC_URL in .env to enable Telegram Webhook automatically.');
            }

            // Connect to DB in background
            initDB()
                .then(() => console.log(`✅ Database connected`))
                .catch(dbError => console.error('⚠️ Database connection failed - starting in limited mode:', dbError.message));
        }).on('error', (err) => {
            console.error('❌ HTTP server error:', err);
        });

    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

// Global safety nets
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
});
