const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const { initDB, getSession, getSessionByPhone, updateSession, listHandoffs, saveLead, logMessage } = require('./db');
const { sendToTelegram, setTelegramWebhook } = require('./telegram_client'); 
const botConfig = require('./botConfig.json');

const app = express();

// Capture rawBody for signature verification
app.use(bodyParser.json({
    verify: (req, res, buf) => {
        req.rawBody = buf;
    },
}));
app.set('trust proxy', 1);

const { PORT: PORT_ENV, WHATSAPP_TOKEN, PHONE_NUMBER_ID, VERSION } = process.env;

// Root route
app.get('/', (req, res) => {
    res.status(200).send('Bot is running! 🚀');
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', time: new Date().toISOString() });
});

// --- Admin routes (protected in production) ---
function requireAdmin(req, res, next) {
    const isProd = process.env.NODE_ENV === 'production';
    const token = process.env.ADMIN_TOKEN;

    if (isProd) {
        if (!token) return res.status(403).json({ error: 'ADMIN_TOKEN is not set' });
        const presented = req.get('x-admin-token') || req.query.token;
        if (presented !== token) return res.status(403).json({ error: 'Forbidden' });
    }

    next();
}

// 1. איפוס HANDOFF למספר ספציפי
app.get('/admin/reset-handoff/:phone', requireAdmin, async (req, res) => {
    try {
        const phone = String(req.params.phone).trim();
        await updateSession(phone, { current_state: STATES.WELCOME, intent: null });
        res.send(`HANDOFF reset for ${phone}`);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// 2. סטטוס של מספר ספציפי
app.get('/admin/status/:phone', requireAdmin, async (req, res) => {
    try {
        const phone = String(req.params.phone).trim();
        const session = await getSessionByPhone(phone);
        res.json(session || { message: 'No session found' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. רשימת כל השיחות הפתוחות ב-HANDOFF
app.get('/admin/handoffs', requireAdmin, async (req, res) => {
    try {
        const rows = await listHandoffs();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
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

// --- Webhook Verification (GET) - התיקון הקריטי ---
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe') {
        // כאן אנחנו בודקים ספציפית את הסיסמה שבחרת
        if (token === 'gina2025' || token === process.env.VERIFY_TOKEN) {
            console.log('✅ Webhook Verified Successfully!');
            return res.status(200).send(String(challenge));
        }
        console.error('❌ Verification Failed. Token received:', token);
        return res.sendStatus(403);
    }
    res.status(200).send('Webhook endpoint is active');
});

// --- Incoming WhatsApp Messages (POST) ---
app.post('/webhook', (req, res) => {
    res.sendStatus(200); // אישור קבלה מיידי

    (async () => {
        const body = req.body;
        if (!body || !body.object) return;

        const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        if (!message) return;

        const phoneNumberId = body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
        const from = message.from; 

        // Anti-Echo
        if (from === process.env.PHONE_NUMBER_ID) return;

        try {
            const session = await getSession(from);

            const msgContent = message.text
                ? message.text.body
                : (message.interactive ? (message.interactive.button_reply?.title || 'button') : 'media');

            // שמירת לוג
            await logMessage(from, message.type, msgContent, 'incoming');

            // שליחה לטלגרם
            const telegramMsg = `📩 *הודעה חדשה*
📞 מספר: ${from}
💬 תוכן: ${msgContent}
--
(עשה Reply להודעה זו כדי לענות ללקוח)`;
            
            await sendToTelegram(telegramMsg);

            // בדיקת פקודת איפוס
            const isReset = msgContent && (String(msgContent).toLowerCase() === 'reset' || msgContent === 'התחל');

            // שתיקה במצב נציג אנושי
            if (session.current_state === STATES.HUMAN_HANDOFF && !isReset) {
                console.log(`User ${from} is in HANDOFF mode. Bot is silent.`);
                return; 
            }

            await handleStateLogic(phoneNumberId, from, message, session);
        } catch (error) {
            console.error('Error handling WhatsApp webhook:', error);
        }
    })();
});

// --- Telegram Webhook Logic ---
app.post('/telegram_webhook', async (req, res) => {
    res.sendStatus(200);

    const update = req.body;
    try {
        const chatId = update?.message?.chat?.id;
        const chatType = update?.message?.chat?.type;
        console.log('[Telegram Webhook] chat.id:', chatId, 'chat.type:', chatType);
        console.log('[Telegram Webhook] Full update:', JSON.stringify(update, null, 2));
    } catch (e) {
        console.log('[Telegram Webhook] Failed to stringify update:', e?.message || e);
    }
    if (!update.message) return;

    const adminMsg = update.message.text;
    const replyTo = update.message.reply_to_message;

    if (!replyTo || !replyTo.text) return;

    try {
        const phoneRegex = /📞 מספר:\s*(\d+)/;
        const match = replyTo.text.match(phoneRegex);

        if (!match || !match[1]) {
            await sendToTelegram('❌ שגיאה: לא הצלחתי לזהות למי לענות.');
            return;
        }

        const customerPhone = match[1];

        if (adminMsg === '/close' || adminMsg === 'סיימנו') {
            await updateSession(customerPhone, { current_state: STATES.WELCOME });
            await sendTextMessage(PHONE_NUMBER_ID, customerPhone, "השיחה עם הנציג הסתיימה. חזרתי למצב בוט.");
            await sendToTelegram(`✅ השיחה עם ${customerPhone} נסגרה.`);
            return;
        }

        console.log(`📤 Admin replying to ${customerPhone}: ${adminMsg}`);
        await sendTextMessage(PHONE_NUMBER_ID, customerPhone, adminMsg);
        
    } catch (err) {
        console.error('Error in telegram_webhook:', err.message);
    }
});


// --- Core State Machine Logic ---
async function handleStateLogic(phoneNumberId, from, message, session) {
    const messageType = message.type;
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

    // Human Handoff Check
    if (userInput && (userInput.includes('נציג') || userInput.includes('אנושי') || userInput.toLowerCase().includes('human'))) {
        await updateSession(from, { current_state: STATES.HUMAN_HANDOFF });
        await sendTextMessage(phoneNumberId, from, botConfig.messages.global_handoff_response || "מעביר אותך לנציג אנושי, אנא המתן...");
        await sendToTelegram(`🚨 **בקשת נציג דחופה!**\nלקוח: ${from}\nביקש נציג.`);
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
                    preText = botConfig.messages.sales_floor_warning + "\n";
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
                session.lead_data.city = userInput;
                await saveLead(session);
                
                const summaryMsg = botConfig.messages.lead_completion_summary.replace('{city}', userInput);
                await sendTextMessage(phoneNumberId, from, summaryMsg);
                
                await sendToTelegram(`💰 **ליד חדש!**\nלקוח: ${from}\nעיר: ${userInput}\nגודל: ${session.lead_data.shed_size}`);
                await updateSession(from, { current_state: STATES.WELCOME });
            } else {
                await sendTextMessage(phoneNumberId, from, botConfig.messages.validation_enter_city);
            }
            break;

        case STATES.HUMAN_HANDOFF:
        case STATES.SUMMARY_HANDOFF:
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
        type: "reply", reply: { id: btn.id, title: btn.title } 
    }));
    await sendInteractiveMessage(phoneNumberId, to, text, buttons);
}

async function sendSizeQuestion(phoneNumberId, to) {
    const text = botConfig.messages.sales_question_size;
    const buttons = botConfig.buttons.size_options.map(btn => ({ 
        type: "reply", reply: { id: btn.id, title: btn.title } 
    }));
    await sendInteractiveMessage(phoneNumberId, to, text, buttons);
}

async function sendFlooringQuestion(phoneNumberId, to) {
    const text = botConfig.messages.sales_question_floor;
    const buttons = botConfig.buttons.floor_options.map(btn => ({ 
        type: "reply", reply: { id: btn.id, title: btn.title } 
    }));
    await sendInteractiveMessage(phoneNumberId, to, text, buttons);
}

async function sendTextMessage(phoneNumberId, to, text) {
    try {
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
    } catch (e) {
        console.error("Failed to send WhatsApp message:", e.response ? e.response.data : e.message);
    }
}

async function sendInteractiveMessage(phoneNumberId, to, bodyText, buttons) {
    try {
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
                    action: { buttons: buttons }
                }
            },
            headers: {
                "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
                "Content-Type": "application/json",
            },
        });
    } catch (e) {
        console.error("Failed to send Interactive message:", e.response ? e.response.data : e.message);
    }
}

// --- Server Start ---
async function startServer() {
    const port = Number(process.env.PORT) || 3000;

    app.listen(port, '0.0.0.0', () => {
        console.log(`Server is running strictly on port: ${port}`);
        if (process.env.PUBLIC_URL) {
            setTelegramWebhook(process.env.PUBLIC_URL);
        }
        initDB().then(() => console.log(`✅ Database connected`))
            .catch(dbError => console.error('⚠️ DB Error:', dbError.message));
    });
}

startServer();