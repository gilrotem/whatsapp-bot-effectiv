const axios = require('axios');

async function sendWhatsAppMessage(phone, message, messageType = 'text') {
    const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
    const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
    const VERSION = process.env.VERSION || 'v18.0';

    if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
        console.error('[WhatsApp] Missing WHATSAPP_TOKEN or PHONE_NUMBER_ID');
        return false;
    }

    if (messageType !== 'text') {
        console.error('[WhatsApp] Unsupported message type:', messageType);
        return false;
    }

    try {
        await axios({
            method: 'POST',
            url: `https://graph.facebook.com/${VERSION}/${PHONE_NUMBER_ID}/messages`,
            data: {
                messaging_product: 'whatsapp',
                to: phone,
                text: { body: message }
            },
            headers: {
                Authorization: `Bearer ${WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        return true;
    } catch (error) {
        console.error('[WhatsApp] Failed to send message:', error.response ? error.response.data : error.message);
        return false;
    }
}

module.exports = {
    sendWhatsAppMessage
};
