const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();

const { initDB, getSession, updateSession, saveLead, logMessage } = require('./db');

const app = express();
app.use(bodyParser.json());

const { PORT, VERIFY_TOKEN, WHATSAPP_TOKEN, PHONE_NUMBER_ID, VERSION } = process.env;

// Root route for easy connectivity testing
app.get('/', (req, res) => {
    res.send('Bot is running! Tunnel is active.');
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

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('WEBHOOK_VERIFIED');
            console.log('Challenge:', challenge);
            res.status(200).send(challenge);
        } else {
            console.log('WEBHOOK_VERIFICATION_FAILED', { mode, token });
            res.sendStatus(403);
        }
    }
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
            
            // Generate or retrieve session
            if (!sessions[from]) {
                st or create session from DB
            const session = await getSession(from);
            
            // Log incoming message
            const msgContent = message.text ? message.text.body : (message.interactive ? JSON.stringify(message.interactive) : 'media');
            await logMessage(from, message.type, msgContent, 'incoming'
            try {
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
        await sendTextMessage(phoneNumberId, from, "העברתי את בקשתך לנציג אנושי. ניצור קשר בהקדם! 👨‍💼");
        return;
    }

    switch (session.current_state) {
        
        case STATES.WELCOME:
            if (buttonId) {
                if (buttonId === 'btn_sales') {
                    await updateSession(from, { current_state: STATES.QUALIFY_SIZE, intent: 'sales' });
                    await sendSizeQuestion(phoneNumberId, from);
                } else if (buttonId === 'btn_order') {
                    await sendTextMessage(phoneNumberId, from, "לבירור סטטוס הזמנה, אנא שלח במייל את מספר ההזמנה ל- support@garden.com");
                    await updateSession(from, { current_state: STATES.WELCOME });
                } else if (buttonId === 'btn_support') {
                    await updateSession(from, { current_state: STATES.HUMAN_HANDOFF });
                    await sendTextMessage(phoneNumberId, from, "העברתי את הפנייה לצוות השירות. נחזור אליך בהקדם.");
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
                await sendTextMessage(phoneNumberId, from, "אנא בחר גודל מהאפשרויות למטה 👇");
                await sendSizeQuestion(phoneNumberId, from);
            }
            break;

        case STATES.QUALIFY_FLOOR:
            if (buttonId && (buttonId.startsWith('floor_'))) {
                await updateSession(from, { flooring_status: buttonId, current_state: STATES.ASK_LOCATION });
                
                let preText = "";
                if (buttonId === 'floor_no') {
                    preText = "שימו לב: להתקנת מחסן חובה משטח ישר. נציג יסביר על פתרונות רצפה בהמשך. 🏗️\n\n";
                }
                
                await sendTextMessage(phoneNumberId, from, preText + "שאלה אחרונה לסיום - לאיזו עיר המשלוח?");
            } else {
                await sendTextMessage(phoneNumberId, from, "אנא בחר את סוג המשטח מהכפתורים 👇");
                await sendFlooringQuestion(phoneNumberId, from);
            }
            break;

        case STATES.ASK_LOCATION:
            if (messageType === 'text') {
                await updateSession(from, { city: userInput, current_state: STATES.SUMMARY_HANDOFF });
                
                // Save completed lead
                session.lead_data.city = userInput; // Update local object for saveLead
                await saveLead(session);
                
                const catalogLink = "https://www.effective-shop.co.il/190052-garden-warehouses";
                const summaryMsg = `רשמתי הכל! ✅ העברתי את הפרטים לנציג מומחה שיחזור אליך עם מחיר והתאמה מדויקת (כולל הובלה ל${userInput}). \nבינתיים אפשר להציץ בקטלוג: \n${catalogLink}\nיום מקסים!`;
                await sendTextMessage(phoneNumberId, from, summaryMsg);
                
                console.log("!!! NEW LEAD COMPLETED !!!", session);
                
                // Reset to welcome
                await updateSession(from, { current_state: STATES.WELCOME });
            } else {
                await sendTextMessage(phoneNumberId, from, "אנא כתוב את שם העיר (טקסט חופשי).");
            }
            break;

        case STATES.HUMAN_HANDOFF:
            if (userInput === 'reset' || userInput === 'התחל') {
                await updateSession(from, { current_state: STATES.WELCOME });
                await sendWelcomeMessage(phoneNumberId, from);
            }
            break;
                 session.current_state = STATES.WELCOME;
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
    const text = "שלום וברוכים הבאים לאפקטיב 🏡. כדי שנוכל לתת שירות מהיר ויעיל, באיזה נושא הפנייה?";
    const buttons = [
        { type: "reply", reply: { id: "btn_sales", title: "מתעניין במחסן" } },
        { type: "reply", reply: { id: "btn_order", title: "בירור הזמנה" } },
        { type: "reply", reply: { id: "btn_support", title: "נציג שירות" } }
    ];
    await sendInteractiveMessage(phoneNumberId, to, text, buttons);
}

async function sendSizeQuestion(phoneNumberId, to) {
    const text = "בשמחה! כדי שנתאים לך דגם מדויק, מה גודל המחסן שאתה מחפש בערך?";
    const buttons = [
        { type: "reply", reply: { id: "size_small", title: "קטן (מרפסת)" } },
        { type: "reply", reply: { id: "size_medium", title: "בינוני (רגיל)" } },
        { type: "reply", reply: { id: "size_large", title: "גדול / ענק" } }
    ];
    await sendInteractiveMessage(phoneNumberId, to, text, buttons);
}

async function sendFlooringQuestion(phoneNumberId, to) {
    const text = "תודה. שאלה קריטית להתקנה: האם יש במקום המיועד משטח קשיח ומפולס (בטון/ריצוף)?";
    const buttons = [
        { type: "reply", reply: { id: "floor_yes", title: "כן, יש משטח" } },
        { type: "reply", reply: { id: "floor_no", title: "לא, יש אדמה" } },
        { type: "reply", reply: { id: "floor_unsure", title: "טרם ידוע" } }
    ];
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

// Initialize database and start server
async function startServer() {
    try {
        await initDB();
        const port = PORT || 3002;
        app.listen(port, () => {
            console.log(`✅ Server is listening on port ${port}`);
            console.log(`✅ Database connected`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
