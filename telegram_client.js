const axios = require('axios');
require('dotenv').config();

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
// This will be populated dynamically or via .env. 
// For now, we need to know who to send the message to (your group/chat ID).
// The first time you message the bot, we'll log the Chat ID so you can save it.
let ADMIN_CHAT_ID = process.env.TELEGRAM_CHAT_ID; 

const BASE_URL = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

/**
 * Sends a message to the Telegram admin.
 * @param {string} text - The text to send.
 */
async function sendToTelegram(text) {
    if (!TELEGRAM_TOKEN || !ADMIN_CHAT_ID) {
        console.warn('⚠️ Telegram not configured correctly (missing token or chat_id).');
        return;
    }

    try {
        await axios.post(`${BASE_URL}/sendMessage`, {
            chat_id: ADMIN_CHAT_ID,
            text: text,
            parse_mode: 'Markdown'
        });
    } catch (error) {
        console.error('❌ Failed to send to Telegram:', error.message);
    }
}

/**
 * Parses incoming Telegram webhook updates to find replies.
 * This is effectively the "Reverse Logic" - Human replies in Telegram.
 * @param {object} reqBody - The body of the webhook from Telegram.
 * @returns {object|null} - Null if irrelevant, or { whatsappPhone, messageText } if it's a reply.
 */
function parseTelegramUpdate(reqBody) {
    // Basic structure of a message
    const message = reqBody.message || reqBody.edited_message;
    if (!message || !message.text) return null;

    // We only care if it comes from the Admin (security)
    if (String(message.chat.id) !== String(ADMIN_CHAT_ID)) {
        console.log(`⚠️ Ignored message from unknown chat ID: ${message.chat.id}`);
        // Small hack: Log this ID so you can grab it for your .env
        console.log(`💡 HINT: Add TELEGRAM_CHAT_ID=${message.chat.id} to your .env file.`);
        return null;
    }

    // Now, we need to know WHICH WhatsApp user this is a reply to.
    // OPTION A: The human explicitly types "Reply to 97250...: hello"
    // OPTION B (Better): We utilize the "Reply" feature in Telegram. 
    // BUT: Using the real Reply feature requires us to store message mapping in DB.
    // SIMPLE MVP (Option C): The admin just types "/send 97250123... message"
    // SIMPLE MVP 2 (Option D): If the LAST message sent to Telegram was from User X, we assume the reply is for User X.
    
    // Let's go with Option C for robustness first (Command based):
    // Format: /reply 972547462208 Hello there!
    
    if (message.text.startsWith('/reply')) {
        const parts = message.text.split(' ');
        if (parts.length < 3) return null;
        
        const phone = parts[1];
        const text = parts.slice(2).join(' ');
        
        return {
            whatsappPhone: phone,
            messageText: text
        };
    }

    return null;
}

/**
 * Initializes the Telegram Webhook (tells Telegram where to send events).
 * @param {string} publicUrl - Your Railway/Tunnel URL.
 */
async function setTelegramWebhook(publicUrl) {
    if (!TELEGRAM_TOKEN) return;
    const webhookUrl = `${publicUrl}/telegram_webhook`;
    try {
        await axios.post(`${BASE_URL}/setWebhook`, {
            url: webhookUrl
        });
        console.log(`✅ Telegram Webhook set to: ${webhookUrl}`);
    } catch (error) {
        console.error('❌ Failed to set Telegram webhook:', error.message);
    }
}

module.exports = {
    sendToTelegram,
    parseTelegramUpdate,
    setTelegramWebhook
};
